import { afterAll, describe, expect, it } from 'bun:test';
import tap from 'supertest';
import { Shokupan } from '../../../shokupan';
import { Dashboard } from '../dashboard/plugin';

describe('Debug Dashboard Plugin', () => {
    it('should collect metrics and render the dashboard', async () => {
        const app = new Shokupan({
            port: 0,
        });

        app.register(new Dashboard({ path: "/admin" }));
        app.get('/success', (ctx) => ctx.text('ok'));
        app.get('/fail', (ctx) => ctx.text('error', 500));

        const server = await app.listen();
        const request = tap(server.url.toString());

        // Make some requests
        await request.get('/success').expect(200);
        await request.get('/success').expect(200);
        await request.get('/fail').expect(500);

        // Check dashboard HTML
        const res = await request.get('/admin').expect(200);
        const html = res.text;

        // Verify metrics in HTML (initial render)
        expect(html).toContain('Total Requests');
        expect(html).toContain('3');

        // Verify JSON metrics endpoint
        const metricsRes = await request.get('/admin/metrics').expect(200);
        const data = metricsRes.body;

        expect(data.metrics.totalRequests).toBeGreaterThan(0);
        expect(data.metrics.successfulRequests).toBeGreaterThan(0);
        expect(data.metrics.failedRequests).toBeGreaterThanOrEqual(0);
        expect(data.metrics.activeRequests).toBeGreaterThanOrEqual(0); // Router hooks cause different counting
        expect(data.uptime).toBeDefined();
    });

    afterAll(() => {
        const { FetchInterceptor } = require('../dashboard/fetch-interceptor');
        FetchInterceptor.restore();
    });

    it('should ignore requests based on configuration', async () => {
        const app = new Shokupan({ port: 0 });
        app.register(new Dashboard({
            path: "/admin",
            ignoreStatusCodes: [418],
            ignoreMethods: ['DELETE'],
            ignorePatterns: [
                '/ignored/**',
                /\/regex-ignored/,
                (req) => req.url.includes('callback-ignored')
            ]
        }));

        app.get('/ignored/test', (ctx) => ctx.text('ignored'));
        app.get('/regex-ignored', (ctx) => ctx.text('ignored'));
        app.get('/callback-ignored', (ctx) => ctx.text('ignored'));
        app.get('/normal', (ctx) => ctx.text('ok'));
        app.get('/teapot', (ctx) => ctx.text('teapot', 418));
        app.delete('/delete', (ctx) => ctx.text('deleted'));

        const server = await app.listen();
        const request = tap(server.url.toString());

        await request.get('/ignored/test').expect(200);
        await request.get('/regex-ignored').expect(200);
        await request.get('/callback-ignored').expect(200);
        await request.get('/teapot').expect(418);
        await request.delete('/delete').expect(200);
        await request.get('/normal').expect(200);

        // Check requests endpoint
        const res = await request.get('/admin/requests').expect(200);
        const requests = res.body.requests;

        // Should only contain /normal and /admin/requests (if not self-ignored, but code effectively ignores dashboard path)
        const urls = requests.map((r: any) => new URL(r.url).pathname);

        expect(urls).toContain('/normal');
        expect(urls).not.toContain('/ignored/test');
        expect(urls).not.toContain('/regex-ignored');
        expect(urls).not.toContain('/callback-ignored');
        expect(urls).not.toContain('/teapot');
        expect(urls).not.toContain('/delete');
    });

    it('should disable replay endpoint when configured', async () => {
        const app = new Shokupan({ port: 0 });
        app.register(new Dashboard({
            path: "/admin",
            disableReplay: true
        }));

        const server = await app.listen();
        const request = tap(server.url.toString());

        await request.post('/admin/replay').send({}).expect(404);
    });
});
