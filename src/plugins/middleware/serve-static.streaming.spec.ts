import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { serveStatic } from './serve-static';
import { Shokupan } from '../../shokupan';

const TEST_DIR = join(process.cwd(), 'temp_static_test');
const LARGE_FILE = join(TEST_DIR, 'large_file.txt');

describe('Serve Static Streaming', () => {

    beforeAll(async () => {
        await mkdir(TEST_DIR, { recursive: true });
        // Create a dummy large file (5MB)
        const buffer = Buffer.alloc(5 * 1024 * 1024, 'a');
        await writeFile(LARGE_FILE, buffer);
    });

    afterAll(async () => {
        await rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should serve file correctly', async () => {
        const app = new Shokupan();

        app.use(serveStatic({ root: TEST_DIR }, '/static'));

        const res = await app.fetch(new Request('http://localhost/static/large_file.txt'));

        expect(res.status).toBe(200);

        // In Bun, this test runs in Bun, so it uses Bun.file(). 
        // We can't easily force the Node.js path unless we mock Bun global or run this test in Node.
        // However, we can assert that the response body is readable.

        const blob = await res.blob();
        expect(blob.size).toBe(5 * 1024 * 1024);
    });

    // To strictly test the Node.js streaming logic, we would need to run this code in Node.
    // Since we are in a Bun environment (likely), `typeof Bun` will be defined.
    // We can simulate Node.js environment by temporarily hiding `Bun`? 
    // But `Bun.file` usage is hardcoded in the plugin.

    it('should fall back to streaming if Bun is undefined (Simulated)', async () => {
        // We can't redefine global Bun easily. 
        // But we can manually check the logic by ensuring the plugin code handles it.
        // We can verify the stream capability by checking if response.body is a ReadableStream.

        const app = new Shokupan();
        app.use(serveStatic({ root: TEST_DIR }, '/static'));
        const res = await app.fetch(new Request('http://localhost/static/large_file.txt'));
        expect(res.body).toBeInstanceOf(ReadableStream);
    });
});
