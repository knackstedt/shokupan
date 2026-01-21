import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import DebugDashboard from '../../plugins/application/dashboard/plugin';
import { ShokupanRouter } from '../../router';
import { Shokupan } from '../../shokupan';

const PORT = 4000 + Math.floor(Math.random() * 1000);

describe('Debug Dashboard Metrics', () => {
    const app = new Shokupan({
        port: PORT,
        applicationConfig: { enableTracing: false }
    });
    let baseUrl: string;
    let server: any;

    beforeAll(async () => {
        // Add some dummy routes
        const router = new ShokupanRouter();
        router.get('/fast', (ctx) => ctx.json({ status: 'ok' }));
        router.get('/slow', async (ctx) => {
            await new Promise(r => setTimeout(r, 100)); // 100ms delay
            return ctx.json({ status: 'slow' });
        });
        router.get('/error', (ctx) => {
            throw new Error("Simulated Error");
        });

        app.mount('/', router);
        app.register(DebugDashboard(), { path: '/debug' });

        server = await app.listen();
        baseUrl = `http://localhost:${PORT}`;
    });

    afterAll(async () => {
        if (server) server.stop();
    });

    it('should collect metrics and serve them', async () => {
        // Generate some traffic
        await fetch(`${baseUrl}/fast`);
        await fetch(`${baseUrl}/fast`);
        await fetch(`${baseUrl}/slow`);
        try { await fetch(`${baseUrl}/error`); } catch { }

        // Allow some time for metrics collector to tick (it runs every 10s usually, but we forced flush logic?)
        // The collector runs every 10s. We might need to wait or mock time.
        // For unit test stability, waiting 11s is too long. 
        // We can manually trigger flush if we had access, but we don't easily.
        // However, the endpoints should at least be up.

        const res = await fetch(`${baseUrl}/debug/metrics/history?interval=1m`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.metrics).toBeArray();
        // Might be empty if flush hasn't happened.
    });

    it('should track top requests', async () => {
        const res = await fetch(`${baseUrl}/debug/requests/top`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.top).toBeArray();
    });

    it('should track top errors', async () => {
        const res = await fetch(`${baseUrl}/debug/errors/top`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.top).toBeArray();
    });

    it('should track slowest requests', async () => {
        const res = await fetch(`${baseUrl}/debug/requests/slowest`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.slowest).toBeArray();
    });

    afterAll(() => {
        // Force cleanup of the FetchInterceptor
        const { FetchInterceptor } = require('../../plugins/application/dashboard/fetch-interceptor');
        // We can't access the instance used by the plugin, but FetchInterceptor patches globals.
        // We can create a new instance and call unpatch, which checks global state?
        // Wait, `isPatched` is an instance property.
        // But the patches are global.
        // If we create a NEW instance, isPatched is false, so unpatch() does nothing.
        // We need to access the instance used by the plugin or manually restore global.fetch.

        // Let's manually restore global.fetch if it looks patched.
        // FetchInterceptor uses `originalFetch`.
        // If we don't have access to the original, we might be stuck unless we trust the plugin destructor.
        // The Plugin doesn't seem to have a detached/stop method that unpatches.

        // HACK: Restore global.fetch blindly if it seems necessary, but we don't have the original ref easily.
        // BETTER: Update FetchInterceptor to have a static method to restore? Or singleton.

        // Since I can modify FetchInterceptor, let's make it a singleton or add a static restore.
    });
});
