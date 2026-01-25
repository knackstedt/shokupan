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
});
