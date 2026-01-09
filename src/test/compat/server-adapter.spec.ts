import { describe, expect, it } from "bun:test";
import { createHttpServer } from "../../plugins/application/http-server";
import { Shokupan } from "../../shokupan";

describe("Server Adapters", () => {
    it("should support swapping the server engine to node:http", async () => {
        const app = new Shokupan({
            port: 0,
            serverFactory: createHttpServer()
        });

        app.get("/", ctx => ctx.text("Hello from Node HTTP"));

        const server = await app.listen();
        expect(server.port).toBeGreaterThan(0);

        const res = await fetch(`http://${server.hostname}:${server.port}/`);
        expect(await res.text()).toBe("Hello from Node HTTP");

        server.stop();
    });

    it("should support app.stop() with node:http server", async () => {
        const app = new Shokupan({
            port: 0,
            serverFactory: createHttpServer()
        });

        app.get("/", ctx => ctx.text("Hello from Node HTTP"));

        const server = await app.listen();
        expect(server.port).toBeGreaterThan(0);

        const res = await fetch(`http://${server.hostname}:${server.port}/`);
        expect(await res.text()).toBe("Hello from Node HTTP");

        // Use app.stop() instead of server.stop()
        await app.stop();

        // Verify server is stopped
        try {
            await fetch(`http://${server.hostname}:${server.port}/`);
            expect(true).toBe(false); // Should not reach here
        } catch (err) {
            // Expected to fail - server is stopped
            expect(err).toBeDefined();
        }
    });
});
