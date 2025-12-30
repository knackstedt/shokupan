import { describe, expect, it } from 'bun:test';
import tap from 'supertest';
import { DebugDashboard } from '../../plugins/debugview/plugin';
import { Shokupan } from '../../shokupan';

describe('Debug Dashboard Plugin', () => {
    it('should collect metrics and render the dashboard', async () => {
        const dashboard = new DebugDashboard();
        const app = new Shokupan({
            port: 0,
            hooks: dashboard.getHooks()
        });

        app.mount('/admin', dashboard);
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

        // Total requests: 
        // 2x /success (200)
        // 1x /fail (500)
        // 1x /admin (200)
        // 1x /admin/metrics (200)
        // Total = 5
        // Total = 5
        expect(data.metrics.totalRequests).toBe(5);
        expect(data.metrics.successfulRequests).toBe(3); // 2 success + 1 admin (metrics request is active)
        expect(data.metrics.failedRequests).toBe(1);
        expect(data.metrics.activeRequests).toBe(1); // The current metrics request
        expect(data.uptime).toBeDefined();

        server.stop();
    });
});
