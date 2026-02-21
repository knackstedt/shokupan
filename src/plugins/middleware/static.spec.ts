import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Shokupan } from '../../shokupan';
import { Static } from './static';

describe('Static Middleware with Fallthrough', () => {
    let testDir: string;
    let app: Shokupan;

    beforeAll(async () => {
        // Create temporary directory with test files
        testDir = await mkdtemp(join(tmpdir(), 'static-test-'));
        await writeFile(join(testDir, 'index.html'), '<html><body>Index</body></html>');
        await writeFile(join(testDir, 'test.txt'), 'Test content');
        await writeFile(join(testDir, 'data.json'), JSON.stringify({ message: 'Hello' }));
    });

    afterAll(async () => {
        // Cleanup
        await rm(testDir, { recursive: true, force: true });
    });

    it('should serve existing static files', async () => {
        app = new Shokupan({ development: true });

        app.get('/app/*',
            Static({ root: testDir }),
            async (ctx) => {
                return ctx.text('Fallback handler');
            }
        );

        await app.start();

        const res = await app.testRequest({ path: '/app/test.txt' });
        expect(res.status).toBe(200);
        expect(res.data).toBe('Test content');
    });

    it('should fall through to route handler when file not found', async () => {
        app = new Shokupan({ development: true });

        app.get('/app/*',
            Static({ root: testDir }),
            async (ctx) => {
                return ctx.text('Fallback handler - file not found');
            }
        );

        await app.start();

        const res = await app.testRequest({ path: '/app/does-not-exist.txt' });
        expect(res.status).toBe(200);
        expect(res.data).toBe('Fallback handler - file not found');
    });

    it('should serve index.html for directory requests', async () => {
        app = new Shokupan({ development: true });

        app.get('/app/*',
            Static({ root: testDir }),
            async (ctx) => {
                return ctx.text('Fallback');
            }
        );

        await app.start();

        const res = await app.testRequest({ path: '/app/' });
        expect(res.status).toBe(200);
        expect(res.data).toContain('Index');
    });

    it('should work with nested paths', async () => {
        app = new Shokupan({ development: true });

        app.get('/static/*',
            Static({ root: testDir }),
            async (ctx) => {
                return ctx.json({ fallback: true, path: ctx.path });
            }
        );

        await app.start();

        // Existing file
        const res1 = await app.testRequest({ path: '/static/data.json' });
        expect(res1.status).toBe(200);
        expect(res1.data).toEqual({ message: 'Hello' });

        // Non-existing file - falls through
        const res2 = await app.testRequest({ path: '/static/missing.json' });
        expect(res2.status).toBe(200);
        expect(res2.data).toEqual({ fallback: true, path: '/static/missing.json' });
    });

    it('should support SPA routing pattern', async () => {
        app = new Shokupan({ development: true });

        // Typical SPA setup: serve static assets, but fall back to index.html for routes
        app.get('/**',
            Static({ root: testDir }),
            async (ctx) => {
                // Serve index.html for all routes that don't match files
                return ctx.html('<html><body>SPA App</body></html>');
            }
        );

        await app.start();

        // Static file works
        const res1 = await app.testRequest({ path: '/test.txt' });
        expect(res1.data).toBe('Test content');

        // Route falls through to SPA handler
        const res2 = await app.testRequest({ path: '/some/spa/route' });
        expect(res2.data).toContain('SPA App');
    });
});
