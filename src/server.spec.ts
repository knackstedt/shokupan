
import { afterAll, describe, expect, it } from "bun:test";
import { Shokupan } from "./shokupan";

describe('ShokupanServer Lifecycle', () => {
    let app: Shokupan;
    let server: any;

    afterAll(async () => {
        if (app) await app.stop();
    });

    it('should start and listen on a port', async () => {
        app = new Shokupan({
            port: 0, // Random port
            development: false,
            enableOpenApiGen: false,
            enableAsyncApiGen: false
        });

        app.get('/ping', (ctx) => ctx.text('pong'));

        server = await app.listen();
        expect(server).toBeDefined();
        expect(server.port).toBeGreaterThan(0);
        expect(app.applicationConfig.port).toBe(server.port);

        // Verify request
        const res = await fetch(`http://localhost:${server.port}/ping`);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('pong');
    });

    it('should stop the server', async () => {
        await app.stop();
        // Verifying stop is tricky without checking if port is free, but we expect no error
        // and app.server to be undefined.
        expect(app.server).toBeUndefined();
    });

    it('should allow start() separate from listen()', async () => {
        const app2 = new Shokupan({ 
            port: 0,
            development: false,
            enableOpenApiGen: false,
            enableAsyncApiGen: false
        });
        let hookRun = false;
        app2.onStart(() => { hookRun = true; });

        await app2.start();
        expect(hookRun).toBe(true);

        const srv = await app2.listen();
        expect(srv).toBeDefined();
        await app2.stop();
    });
});
