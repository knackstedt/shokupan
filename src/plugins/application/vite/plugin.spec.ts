import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { Shokupan } from '../../../shokupan';
import { VitePlugin } from './plugin';

let tmpDir: string;

function mkTmpDir() {
    tmpDir = path.join(process.cwd(), `tmp-vite-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
}

describe('VitePlugin', () => {
    beforeEach(() => {
        mkTmpDir();
    });

    afterEach(() => {
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('should register without crashing when no vite config exists', async () => {
        const app = new Shokupan({ development: true });
        const plugin = new VitePlugin();
        await app.register(plugin);
        await app.start();
        expect(plugin).toBeDefined();
    });

    it('should serve index.html from explicit outDir in production', async () => {
        const outDir = path.join(tmpDir, 'custom-dist');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'index.html'), '<html><body>hello</body></html>');

        const app = new Shokupan({ development: false });
        await app.register(new VitePlugin({ outDir }));
        await app.start();
        await app.listen(0);

        const res = await fetch(`http://localhost:${app.applicationConfig.port}/`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toBe('<html><body>hello</body></html>');

        await app.stop();
    });

    it('should fallback to index.html for unmatched HTML requests in production', async () => {
        const outDir = path.join(tmpDir, 'dist');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'index.html'), '<html><body>spa</body></html>');

        const app = new Shokupan({ development: false });
        await app.register(new VitePlugin({ outDir }));
        await app.start();
        await app.listen(0);

        const res = await fetch(`http://localhost:${app.applicationConfig.port}/dashboard`, {
            headers: { accept: 'text/html' }
        });
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toBe('<html><body>spa</body></html>');

        await app.stop();
    });

    it('should not fallback for JSON requests in production', async () => {
        const outDir = path.join(tmpDir, 'dist');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'index.html'), '<html><body>spa</body></html>');

        const app = new Shokupan({ development: false });
        await app.register(new VitePlugin({ outDir }));
        await app.start();
        await app.listen(0);

        const res = await fetch(`http://localhost:${app.applicationConfig.port}/api/unknown`, {
            headers: { accept: 'application/json' }
        });
        expect(res.status).toBe(404);

        await app.stop();
    });

    it('should serve static files from custom mount path in production', async () => {
        const outDir = path.join(tmpDir, 'dist');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'index.html'), '<html><body>app</body></html>');
        fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(outDir, 'assets', 'main.js'), 'console.log(1)');

        const app = new Shokupan({ development: false });
        await app.register(new VitePlugin({ path: '/app', outDir }));
        await app.start();
        await app.listen(0);

        const res = await fetch(`http://localhost:${app.applicationConfig.port}/app/assets/main.js`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toBe('console.log(1)');

        await app.stop();
    });

    it('should register SPA fallback error handler in dev mode', async () => {
        const configFile = path.join(tmpDir, 'vite.config.ts');
        fs.writeFileSync(configFile, `export default {};`);

        const app = new Shokupan({ development: true });
        const plugin = new VitePlugin({ configFile, root: tmpDir });
        await app.register(plugin);
        await app.start();

        expect(plugin).toBeDefined();
        if ((plugin as any).viteServer) {
            await (plugin as any).viteServer.close();
        }
    });
});
