import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { Shokupan } from '../../../shokupan';
import { VitePlugin } from './plugin';

let browserAvailable = false;
try {
    await chromium.launch({ headless: true });
    browserAvailable = true;
} catch {
    // Browser not installed, skip Playwright tests
}

describe('VitePlugin Playwright E2E', () => {
    if (!browserAvailable) {
        it.skip('Playwright browser not installed', () => {});
        return;
    }

    let tmpDir: string;
    let app: Shokupan;
    let serverPort: number;
    let browser: any;
    let page: any;

    beforeAll(async () => {
        tmpDir = path.join(process.cwd(), `pw-vite-test-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });

        fs.writeFileSync(
            path.join(tmpDir, 'vite.config.ts'),
            `export default { root: '${tmpDir.replace(/\\/g, '\\\\')}', build: { outDir: 'dist' } };`
        );

        fs.writeFileSync(
            path.join(tmpDir, 'index.html'),
            `<!DOCTYPE html>
<html>
<head><title>Playwright Test</title></head>
<body>
  <h1 id="status">Waiting...</h1>
  <button id="btn">Call API</button>
  <pre id="result"></pre>
  <script type="module">
    document.getElementById('status').textContent = 'Page loaded';
    document.getElementById('btn').addEventListener('click', async () => {
      const res = await fetch('/api/hello');
      const data = await res.json();
      document.getElementById('result').textContent = JSON.stringify(data);
    });
  </script>
</body>
</html>`
        );

        serverPort = 9876;
        app = new Shokupan({ port: serverPort, development: true });
        app.get('/api/hello', (ctx) => ctx.json({ message: 'Hello from API', time: Date.now() }));

        const plugin = new VitePlugin({
            configFile: path.join(tmpDir, 'vite.config.ts'),
            root: tmpDir,
            spaFallback: true,
        });
        await app.register(plugin);
        await app.listen(serverPort);

        // Give Vite time to start
        await new Promise(r => setTimeout(r, 3000));

        browser = await chromium.launch({ headless: true });
        page = await browser.newPage();
    }, 30000);

    afterAll(async () => {
        if (page) await page.close();
        if (browser) await browser.close();
        if (app) {
            try { await app.stop(); } catch { }
        }
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    }, 15000);

    it('should load the frontend page in a real browser', async () => {
        await page.goto(`http://localhost:${serverPort}/`);
        await page.waitForSelector('#status');
        const text = await page.textContent('#status');
        expect(text).toBe('Page loaded');
    }, 15000);

    it('should call the API from the browser and display results', async () => {
        await page.goto(`http://localhost:${serverPort}/`);
        await page.waitForSelector('#btn');
        await page.click('#btn');
        await page.waitForFunction(() => {
            const el = document.getElementById('result');
            return el && el.textContent && el.textContent.includes('Hello from API');
        }, { timeout: 5000 });
        const resultText = await page.textContent('#result');
        expect(resultText).toContain('Hello from API');
    }, 15000);

    it('should get a 404 for unknown API routes', async () => {
        const response = await page.goto(`http://localhost:${serverPort}/api/unknown`);
        expect(response.status()).toBe(404);
    }, 10000);
});
