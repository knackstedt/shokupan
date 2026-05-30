import { describe, expect, mock, test } from "bun:test";
import { Controller, OnStop } from "./decorators";
import { GracefulShutdown } from "./plugins/application/graceful-shutdown";
import { ShokupanRouter } from "./router";
import { Shokupan } from "./shokupan";
import { ShokupanWebsocketRouter } from "./websocket";

describe("Graceful Shutdown", () => {

    test("onStop hook execution in app.stop()", async () => {
        const onStop = mock();
        const app = new Shokupan({
            port: 0,
            hooks: {
                onStop
            }
        });

        await app.stop();
        expect(onStop).toHaveBeenCalled();
    });

    test("Router-level onStop hook execution", async () => {
        const onStop = mock();
        const router = new ShokupanRouter({
            hooks: { onStop }
        });

        const app = new Shokupan({ port: 0 });
        app.mount("/api", router);

        await app.stop();
        expect(onStop).toHaveBeenCalled();
    });

    test("@OnStop decorator execution", async () => {
        const onStop = mock();

        @Controller("/test")
        class TestController {
            @OnStop()
            async cleanup() {
                onStop();
            }
        }

        const app = new Shokupan({ port: 0 });
        app.mount("/", TestController);

        await app.stop();
        expect(onStop).toHaveBeenCalled();
    });

    test("ShokupanWebsocketRouter onStop hook execution", async () => {
        const onStop = mock();
        const wsRouter = new ShokupanWebsocketRouter();
        wsRouter.onStop(onStop);

        const app = new Shokupan({ port: 0 });
        app.mount("/ws", wsRouter);

        await app.stop();
        expect(onStop).toHaveBeenCalled();
    });

    test("GracefulShutdown plugin connection tracking and 503", async () => {
        const app = new Shokupan({ port: 0 });
        const plugin = new GracefulShutdown({ forceExit: false });
        await app.register(plugin);

        app.get("/slow", async (ctx) => {
            await new Promise(r => setTimeout(r, 100));
            return "ok";
        });

        // Start a "slow" request
        const requestPromise = app.fetch(new Request("http://localhost/slow"));

        // Trigger shutdown handler manually (simulating signal)
        // We cast to any to access private handleSignal
        const shutdownPromise = (plugin as any).handleSignal('SIGINT', app);

        // While shutting down, new requests should get 503
        const res503 = await app.fetch(new Request("http://localhost/slow"));
        expect(res503.status).toBe(503);
        expect(await res503.text()).toBe("Service Unavailable - Shutting down");

        // Wait for slow request to finish
        const resOk = await requestPromise;
        expect(resOk.status).toBe(200);

        await shutdownPromise;
    });

    test("GracefulShutdown plugin timeout", async () => {
        const app = new Shokupan({ port: 0 });
        const plugin = new GracefulShutdown({
            forceExit: false,
            timeout: 50 // Very short timeout
        });
        await app.register(plugin);

        app.get("/slow", async (ctx) => {
            await new Promise(r => setTimeout(r, 200));
            return "ok";
        });

        // Start a slow request that will exceed timeout
        const requestPromise = app.fetch(new Request("http://localhost/slow"));

        const start = Date.now();
        await (plugin as any).handleSignal('SIGINT', app);
        const duration = Date.now() - start;

        // Should have finished around 50ms (the timeout) instead of 200ms
        expect(duration).toBeLessThan(300);

        // The slow request should still eventually finish though if it wasn't aborted
        const res = await requestPromise;
        expect(res.status).toBe(200);
    });
});
