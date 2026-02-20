import { existsSync, promises as fs, watch } from 'node:fs';
import * as path from 'node:path';
import { createLogger, type Logger } from './logger';

export type EnvLoaderOptions = {
    /**
     * If provided, k8s secrets will be loaded from the given paths
     * @default []
     */
    k8sSecretMountPaths?: string[];
    /**
     * If provided, k8s config maps will be loaded from the given paths
     * @default []
     */
    k8sConfigMapMountPaths?: string[];
    /**
     * Optional logger instance
     */
    logger?: Logger;
};

type Listener<T> = (value: T) => void;

/**
 * A subject that emits values to listeners.
 * 
 * This is used to emit values to listeners when they change.
 */
export class EmitterSubject<T> {
    private _value: T;
    private _listeners: Set<Listener<T>> = new Set();

    constructor(initialValue: T) {
        this._value = initialValue;

        // Security: Hide the internal value from JSON.stringify and loops
        Object.defineProperty(this, '_value', { enumerable: false, writable: true });
        Object.defineProperty(this, '_listeners', { enumerable: false, writable: true });
    }

    get value(): T {
        return this._value;
    }

    next(newValue: T): void {
        this._value = newValue;
        this._listeners.forEach(parentCallback => parentCallback(newValue));
    }

    subscribe(callback: Listener<T>): { unsubscribe: () => void; } {
        this._listeners.add(callback);

        callback(this._value);

        return {
            unsubscribe: () => this._listeners.delete(callback)
        };
    }

    toString() {
        return '[EmitterSubject]';
    }

    toJSON() {
        return '[EmitterSubject]';
    }
}

/**
 * Extend this class with a class of your own. The extended class static properties will then
 * be dynamically loaded from environment variables (additionally .env files).
 * Values will be trimmed then parsed to the type of the property.
 * 
 * Secrets should be loaded using the getSecret method -- this prevents them from being logged
 * or otherwise leaked, and enables the use of environment variables to load secrets from
 * k8s secrets, vault, etc.
 * 
 * ```typescript
 * class myEnv extends EnvLoader {
 *     readonly prop = 123; // loads env variable PROP or PROP (mapped)
 *     readonly prop_time = 123; // loads env variable PROP_TIME
 *     readonly propTime = 123; // loads env variable PROP_TIME
 * }
 * ```
 */
const $secretsCache = Symbol('secretsCache');
const $secretSubjects = Symbol('secretSubjects');
const $options = Symbol('options');
const $watchers = Symbol('watchers');
const $watchersStarted = Symbol('watchersStarted');
const $logger = Symbol('logger');

const $getSecretValueInternal = Symbol('getSecretValueInternal');
const $getOrCreateSubject = Symbol('getOrCreateSubject');
const $loadSecrets = Symbol('loadSecrets');
const $setupWatchers = Symbol('setupWatchers');
const $updateSubject = Symbol('updateSubject');
const $updateMappedProperty = Symbol('updateMappedProperty');
const $mapProperties = Symbol('mapProperties');
const $assignProperty = Symbol('assignProperty');
const $toSnakeCase = Symbol('toSnakeCase');
const $snakeCaseCache = Symbol('snakeCaseCache');

export abstract class EnvLoader {
    private [$secretsCache]: Map<string, string> = new Map();
    private [$secretSubjects]: Map<string, EmitterSubject<string | undefined>> = new Map();
    private [$options]: EnvLoaderOptions;
    private [$watchers]: ReturnType<typeof watch>[] = [];
    private [$watchersStarted] = false;
    private [$logger]: Logger;
    // P4: Memoize camelCase→SNAKE_CASE conversions — the regex runs repeatedly for the
    // same keys on every $updateMappedProperty call, so cache the results.
    private [$snakeCaseCache]: Map<string, string> = new Map();

    constructor(options?: EnvLoaderOptions) {
        this[$options] = {
            k8sSecretMountPaths: [],
            k8sConfigMapMountPaths: [],
            ...options
        };
        this[$logger] = options?.logger || createLogger();
    }

    /**
     * Initialize the loader: read secrets.
     * This must be called after the constructor.
     */
    async init() {
        await this[$loadSecrets]();
        this[$mapProperties]();
    }

    /**
     * Loads a secret from the environment asynchronously.
     */
    async getSecret(key: string): Promise<string | undefined>;
    async getSecret(key: string, observer: true): Promise<EmitterSubject<string | undefined>>;
    async getSecret(key: string, observer?: boolean): Promise<string | undefined | EmitterSubject<string | undefined>> {
        const val = this[$getSecretValueInternal](key);

        if (observer) {
            return this[$getOrCreateSubject](key, val);
        }
        return val;
    }

    /**
     * Loads a secret from the environment synchronously.
     */
    getSecretSync(key: string): string | undefined;
    getSecretSync(key: string, observer: true): EmitterSubject<string | undefined>;
    getSecretSync(key: string, observer?: boolean): string | undefined | EmitterSubject<string | undefined> {
        const val = this[$getSecretValueInternal](key);

        if (observer) {
            return this[$getOrCreateSubject](key, val);
        }
        return val;
    }

    /**
     * Loads a variable from the environment synchronously.
     */
    getVar(key: string): string | undefined;
    getVar(key: string, observer: true): EmitterSubject<string | undefined>;
    getVar(key: string, observer?: boolean): string | undefined | EmitterSubject<string | undefined> {
        return this.getSecretSync(key, observer as any);
    }

    private [$getSecretValueInternal](key: string): string | undefined {
        if (this[$secretsCache].has(key)) {
            return this[$secretsCache].get(key);
        }
        return process.env[key];
    }

    private [$getOrCreateSubject](key: string, initialValue: string | undefined): EmitterSubject<string | undefined> {
        if (!this[$watchersStarted]) {
            this[$setupWatchers]();
        }

        if (!this[$secretSubjects].has(key)) {
            this[$secretSubjects].set(key, new EmitterSubject(initialValue));
        }
        return this[$secretSubjects].get(key)!;
    }

    private async [$loadSecrets]() {
        const secretPaths = this[$options].k8sSecretMountPaths || [];
        const configMapPaths = this[$options].k8sConfigMapMountPaths || [];
        const paths = [...secretPaths, ...configMapPaths];

        for (const mountPath of paths) {
            if (!existsSync(mountPath)) continue;

            try {
                const files = await fs.readdir(mountPath);
                for (const file of files) {
                    const fullPath = path.join(mountPath, file);
                    try {
                        const stats = await fs.stat(fullPath);
                        if (stats.isFile()) {
                            const content = await fs.readFile(fullPath, 'utf8');
                            this[$secretsCache].set(file, content.trim());
                        }
                    } catch (e) {
                        // ignore read errors for individual files
                    }
                }
            } catch (e) {
                // ignore dir read errors
            }
        }
    }

    private [$setupWatchers]() {
        if (this[$watchersStarted]) return;
        this[$watchersStarted] = true;

        const secretPaths = this[$options].k8sSecretMountPaths || [];
        const configMapPaths = this[$options].k8sConfigMapMountPaths || [];
        const paths = [...secretPaths, ...configMapPaths];

        for (const mountPath of paths) {
            if (!existsSync(mountPath)) continue;

            try {
                const watcher = watch(mountPath, async (eventType, filename) => {
                    if (filename) {
                        const fullPath = path.join(mountPath, filename);

                        try {
                            if (existsSync(fullPath)) {
                                const content = await fs.readFile(fullPath, 'utf8');
                                const trimmed = content.trim();

                                const previous = this[$secretsCache].get(filename);
                                if (previous !== trimmed) {
                                    this[$secretsCache].set(filename, trimmed);
                                    this[$updateSubject](filename, trimmed);
                                }
                            } else {
                                if (this[$secretsCache].has(filename)) {
                                    this[$secretsCache].delete(filename);
                                    this[$updateSubject](filename, undefined);
                                }
                            }
                        } catch (e) {
                            // read error
                        }
                    } else {
                        // Filename missing, maybe reload all?
                    }
                });
                this[$watchers].push(watcher);
            } catch (e) {
                this[$logger].warn(`[EnvLoader]`, `Failed to watch ${mountPath}:`, { error: e });
            }
        }
    }

    private [$updateSubject](key: string, value: string | undefined) {
        const subject = this[$secretSubjects].get(key);
        if (subject) {
            subject.next(value);
        }

        this[$updateMappedProperty](key, value);
    }

    private [$updateMappedProperty](envKey: string, value: string | undefined) {
        for (const key of Object.keys(this)) {
            if (this[$toSnakeCase](key) === envKey || key === envKey) {
                this[$assignProperty](key, value);
            }
        }
    }

    private [$mapProperties]() {
        for (const key of Object.keys(this)) {
            const envKey = this[$toSnakeCase](key);
            const val = this[$getSecretValueInternal](envKey);

            if (val !== undefined) {
                this[$assignProperty](key, val);
            }
        }
    }

    private [$assignProperty](key: string, val: string | undefined) {
        if (val === undefined) return;

        const currentVal = (this as any)[key];
        let newVal: any = val;

        if (typeof currentVal === 'number') {
            newVal = Number(val);
            if (isNaN(newVal)) newVal = currentVal;
        } else if (typeof currentVal === 'boolean') {
            newVal = val.toLowerCase() === 'true' || val === '1';
        }
        // else string

        (this as any)[key] = newVal;
    }

    private [$toSnakeCase](str: string): string {
        // Memoize results to avoid repeated regex on the same key.
        if (this[$snakeCaseCache].has(str)) return this[$snakeCaseCache].get(str)!;
        const result = str.replace(/([A-Z])/g, letter => `_${letter}`).toUpperCase();
        this[$snakeCaseCache].set(str, result);
        return result;
    }
}
