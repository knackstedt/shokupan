import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { Shokupan } from '../../../shokupan';
import { VitePlugin } from './plugin';

// E2E test: starts a real server and hits it with HTTP requests
let portCounter = 9876;
function nextPort() { return portCounter++; }

describe('VitePlugin E2E', () => {
    let tmpDir: string;
    let app: Shokupan;

    beforeAll(async () => {
        tmpDir = path.join(process.cwd(), `e2e-vite-test-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });

        // Write a minimal vite config
        fs.writeFileSync(
            path.join(tmpDir, 'vite.config.ts'),
            `export default { root: '${tmpDir.replace(/\\/g, '\\\\')}', build: { outDir: 'dist' } };`
        );

        // Write index.html for the "frontend"
        fs.writeFileSync(
            path.join(tmpDir, 'index.html'),
            `<!DOCTYPE html>
<html>
<head><title>E2E Test</title></head>
<body>
  <h1 id="status">Frontend loaded</h1>
  <button id="api-btn">Call API</button>
  <pre id="result"></pre>
  <script type="module">
    document.getElementById('api-btn').addEventListener('click', async () => {
      const res = await fetch('/api/hello');
      const data = await res.json();
      document.getElementById('result').textContent = JSON.stringify(data);
    });
  </script>
</body>
</html>`
        );

        // Write a frontend module
        fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpDir, 'src', 'main.ts'),
            `document.getElementById('status')!.textContent = 'JS executed';`
        );
    });

    afterEach(async () => {
        if (app) {
            try { await app.stop(); } catch { /* ignore */ }
            app = undefined as any;
        }
        // Small delay to let the OS free the port
        await new Promise(r => setTimeout(r, 200));
    });

    afterAll(async () => {
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('should serve the Vite frontend in dev mode', async () => {
        const port = nextPort();
        app = new Shokupan({ port, development: true });
        app.get('/api/hello', (ctx) => ctx.json({ message: 'Hello from API' }));

        const plugin = new VitePlugin({
            configFile: path.join(tmpDir, 'vite.config.ts'),
            root: tmpDir,
            spaFallback: true,
        });
        await app.register(plugin);
        await app.listen(port);

        // Give Vite a moment to start
        await new Promise(r => setTimeout(r, 2000));

        // Fetch the root page
        const res = await fetch(`http://localhost:${port}/`);
        expect(res.status).toBe(200);
        const body = await res.text();
        expect(body).toContain('Frontend loaded');

        // Cleanup vite server
        if ((plugin as any).viteServer) {
            await (plugin as any).viteServer.close();
        }
    }, 15000);

    it('should serve API routes alongside Vite in dev mode', async () => {
        const port = nextPort();
        app = new Shokupan({ port, development: true });
        app.get('/api/hello', (ctx) => ctx.json({ message: 'Hello from API' }));

        const plugin = new VitePlugin({
            configFile: path.join(tmpDir, 'vite.config.ts'),
            root: tmpDir,
            spaFallback: true,
        });
        await app.register(plugin);
        await app.listen(port);

        await new Promise(r => setTimeout(r, 2000));

        const res = await fetch(`http://localhost:${port}/api/hello`);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.message).toBe('Hello from API');

        if ((plugin as any).viteServer) {
            await (plugin as any).viteServer.close();
        }
    }, 15000);

    it('should provide SPA fallback in dev mode', async () => {
        const port = nextPort();
        app = new Shokupan({ port, development: true });
        app.get('/api/hello', (ctx) => ctx.json({ message: 'Hello from API' }));

        const plugin = new VitePlugin({
            configFile: path.join(tmpDir, 'vite.config.ts'),
            root: tmpDir,
            spaFallback: true,
        });
        await app.register(plugin);
        await app.listen(port);

        await new Promise(r => setTimeout(r, 2000));

        // A non-existent route that accepts HTML should get index.html (SPA fallback)
        const res = await fetch(`http://localhost:${port}/dashboard`, {
            headers: { accept: 'text/html' }
        });
        expect(res.status).toBe(200);
        const body = await res.text();
        // Vite dev server returns index.html for SPA fallback (may include HMR injections)
        expect(body).toContain('<!DOCTYPE html>');

        if ((plugin as any).viteServer) {
            await (plugin as any).viteServer.close();
        }
    }, 15000);

    it('should NOT fallback for JSON requests in dev mode', async () => {
        const port = nextPort();
        app = new Shokupan({ port, development: true });
        app.get('/api/hello', (ctx) => ctx.json({ message: 'Hello from API' }));

        const plugin = new VitePlugin({
            configFile: path.join(tmpDir, 'vite.config.ts'),
            root: tmpDir,
            spaFallback: true,
        });
        await app.register(plugin);
        await app.listen(port);

        await new Promise(r => setTimeout(r, 2000));

        const res = await fetch(`http://localhost:${port}/api/unknown`, {
            headers: { accept: 'application/json' }
        });
        expect(res.status).toBe(404);

        if ((plugin as any).viteServer) {
            await (plugin as any).viteServer.close();
        }
    }, 15000);

    it('should serve production build with SPA fallback', async () => {
        const port = nextPort();
        const outDir = path.join(tmpDir, 'dist');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(
            path.join(outDir, 'index.html'),
            '<!DOCTYPE html><html><body><h1>Prod Build</h1></body></html>'
        );
        fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
        fs.writeFileSync(
            path.join(outDir, 'assets', 'main.js'),
            'console.log("prod")'
        );

        app = new Shokupan({ port, development: false });
        app.get('/api/hello', (ctx) => ctx.json({ message: 'Hello from API' }));

        await app.register(new VitePlugin({ outDir }));
        await app.listen(port);

        const indexRes = await fetch(`http://localhost:${port}/`);
        expect(indexRes.status).toBe(200);
        expect(await indexRes.text()).toContain('Prod Build');

        const staticRes = await fetch(`http://localhost:${port}/assets/main.js`);
        expect(staticRes.status).toBe(200);
        expect(await staticRes.text()).toBe('console.log("prod")');

        const spaRes = await fetch(`http://localhost:${port}/about`, {
            headers: { accept: 'text/html' }
        });
        expect(spaRes.status).toBe(200);
        expect(await spaRes.text()).toContain('Prod Build');

        const apiRes = await fetch(`http://localhost:${port}/api/hello`);
        expect(apiRes.status).toBe(200);
        expect((await apiRes.json()).message).toBe('Hello from API');
    }, 10000);
});
