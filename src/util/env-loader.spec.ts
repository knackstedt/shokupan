import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { EnvLoader } from './env-loader';

const TEMP_DIR = path.join(tmpdir(), 'shokupan-env-loader-test-' + Math.random().toString(36).slice(2));

class TestEnv extends EnvLoader {
    readonly propOne = 'default';
    readonly propTwo = 0;
    readonly propBool = false;
    readonly k8sSecret = '';
}

describe('EnvLoader', () => {
    beforeAll(async () => {
        await fs.mkdir(TEMP_DIR, { recursive: true });
    });

    afterAll(async () => {
        try {
            await fs.rm(TEMP_DIR, { recursive: true, force: true });
        } catch { }
    });

    it('should map properties from process.env', async () => {
        process.env.PROP_ONE = 'changed';
        process.env.PROP_TWO = '123';
        process.env.PROP_BOOL = 'true';

        const env = new TestEnv();
        await env.init();

        expect(env.propOne).toBe('changed');
        expect(env.propTwo).toBe(123);
        expect(env.propBool).toBe(true);

        delete process.env.PROP_ONE;
        delete process.env.PROP_TWO;
        delete process.env.PROP_BOOL;
    });

    it('should load secrets from K8s mount path', async () => {
        const secretPath = path.join(TEMP_DIR, 'K8S_SECRET');
        await fs.writeFile(secretPath, 'secret_value');

        const env = new TestEnv({ k8sSecretMountPaths: [TEMP_DIR] });
        await env.init();

        expect(await env.getSecret('K8S_SECRET')).toBe('secret_value');
        expect(env.k8sSecret).toBe('secret_value');
    });

    it('should react to file changes with fs watcher', async () => {
        const secretPath = path.join(TEMP_DIR, 'WATCH_SECRET');
        await fs.writeFile(secretPath, 'initial');

        const env = new TestEnv({ k8sSecretMountPaths: [TEMP_DIR] });
        await env.init();

        const subject = await env.getSecret('WATCH_SECRET', true);
        let value = subject.value;
        const sub = subject.subscribe(v => value = v);

        expect(value).toBe('initial');

        // Update file
        await fs.writeFile(secretPath, 'updated');

        // Wait for watcher (fs.watch is async/evented)
        await new Promise(resolve => setTimeout(resolve, 500));

        expect(value).toBe('updated');
        expect(env.getSecretSync('WATCH_SECRET')).toBe('updated');

        sub.unsubscribe();
    });

    it('should auto-update mapped properties on file change if subject is active', async () => {
        const secretPath = path.join(TEMP_DIR, 'AUTO_UPDATE');
        await fs.writeFile(secretPath, 'initial');

        class AutoEnv extends EnvLoader {
            readonly autoUpdate = 'default';
        }

        const env = new AutoEnv({ k8sSecretMountPaths: [TEMP_DIR] });
        await env.init();

        expect(env.autoUpdate).toBe('initial');

        // To trigger watcher, we need to request a subject or manually ensure watchers are active.
        // But mapped properties don't automatically request subjects in current impl.
        // Wait, if users want auto-update for properties, they might expect it to just work?
        // But we only enable watchers if a subject is requested.
        // So let's request a subject for this key.
        const sub = await env.getSecret('AUTO_UPDATE', true);

        const updatePromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout waiting for update')), 5000);
            sub.subscribe((val) => {
                if (val === 'updated') {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });

        await fs.writeFile(secretPath, 'updated');

        await updatePromise;

        expect(env.autoUpdate).toBe('updated');

        // Clean up
        // Clean up
        // sub is the SecretSubject, not the subscription. No need to unsubscribe here as we didn't subscribe.
    });

    it('should load and watch config maps', async () => {
        const configPath = path.join(TEMP_DIR, 'CONFIG_MAP');
        await fs.writeFile(configPath, 'initial_config');

        class ConfigEnv extends EnvLoader {
            readonly configMap = 'default';
        }

        const env = new ConfigEnv({ k8sConfigMapMountPaths: [TEMP_DIR] });
        await env.init();

        expect(env.configMap).toBe('initial_config');
        expect(await env.getSecret('CONFIG_MAP')).toBe('initial_config');

        // Watch test
        const sub = await env.getSecret('CONFIG_MAP', true);

        const updatePromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout waiting for update')), 5000);
            sub.subscribe((val) => {
                if (val === 'updated_config') {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });

        await fs.writeFile(configPath, 'updated_config');

        await updatePromise;

        expect(env.configMap).toBe('updated_config');
        expect(env.getSecretSync('CONFIG_MAP')).toBe('updated_config');
    });
});
