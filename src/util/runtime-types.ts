import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runtime-agnostic type definitions.
 *
 * These types replace direct imports from `bun` so that the codebase
 * can be type-checked and run in Node.js, Deno, and other WinterCG-
 * compatible runtimes without requiring `@types/bun` to be installed.
 *
 * When running under Bun, the actual Bun types are structurally
 * compatible with these definitions.
 */

/**
 * Minimal `BodyInit` type — the standard Web API `BodyInit` is available
 * in all modern runtimes. We re-export it so callers don't import from `bun`.
 */
export type BodyInit = globalThis.BodyInit;

/**
 * Minimal server interface covering the methods/properties used by
 * Shokupan across all adapters (Bun, Node, WinterCG).
 */
export interface ServerServer<T extends Record<string, any> = any> {
    port: number;
    hostname: string;
    development: boolean;
    pendingRequests: number;
    url: URL;
    stop(closeActiveConnections?: boolean): void | Promise<void>;
    reload(options?: any): ServerServer<T>;
    upgrade(req: Request, options?: UpgradeOptions<T>): boolean;
    requestIP(req: Request): string | null;
    publish(topic: string, data: string | ArrayBufferView | ArrayBuffer, compress?: boolean): number;
    subscriberCount(topic: string): number;
    [key: string]: any;
}

/**
 * Options for upgrading an HTTP request to a WebSocket connection.
 */
export interface UpgradeOptions<T = any> {
    headers?: HeadersInit;
    data?: T;
}

/**
 * Minimal `ServerWebSocket` interface covering the methods/properties
 * used by Shokupan's WebSocket router and plugins.
 */
export interface ServerWebSocket<T extends Record<string, any> = any> {
    readonly readyState: number;
    data: T;
    send(data: string | ArrayBufferView | ArrayBuffer, compress?: boolean): number;
    sendText(data: string, compress?: boolean): number;
    sendBinary(data: ArrayBufferView | ArrayBuffer, compress?: boolean): number;
    close(code?: number, reason?: string): void;
    subscribe(topic: string, compress?: boolean): number;
    unsubscribe(topic: string): number;
    publish(topic: string, data: string | ArrayBufferView | ArrayBuffer, compress?: boolean): number;
    publishText(topic: string, data: string, compress?: boolean): number;
    publishBinary(topic: string, data: ArrayBufferView | ArrayBuffer, compress?: boolean): number;
    cork(cb: (ws: ServerWebSocket<T>) => void): number;
    remoteAddress: string;
    [key: string]: any;
}

/**
 * Minimal glob matcher that replaces Bun's `Glob` class.
 * Supports `*` and `**` wildcard patterns.
 */
export class Glob {
    private pattern: string;

    constructor(pattern: string) {
        this.pattern = pattern;
    }

    match(path: string): boolean {
        // Convert glob pattern to regex
        const regexStr = this.pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '<<DOUBLESTAR>>')
            .replace(/\*/g, '[^/]*')
            .replace(/<<DOUBLESTAR>>/g, '.*')
            .replace(/\?/g, '.');
        const regex = new RegExp('^' + regexStr + '$');
        return regex.test(path);
    }
}

/**
 * Cross-runtime replacement for Bun's `import.meta.file`.
 * Returns the filename of the current module.
 */
export function getMetaFile(metaUrl: string): string {
    try {
        return basename(fileURLToPath(metaUrl));
    } catch {
        return metaUrl.split('/').pop() || '';
    }
}
