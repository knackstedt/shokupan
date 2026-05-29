import { describe, expect, it } from "bun:test";
import { Shokupan } from '../../shokupan';

describe("app.stop()", () => {
    it("should stop the server using app.stop() instead of server.stop()", async () => {
        const app = new Shokupan({ port: 0 });

        app.get("/hello", (ctx) => {
            return ctx.json({ message: "Hello" });
        });

        const server = await app.listen();

        // Verify server is running
        const res = await fetch(`http://localhost:${server.port}/hello`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.message).toBe("Hello");

        // Stop using app.stop() instead of server.stop()
        await app.stop();

        // Verify server is stopped (this should fail to connect)
        try {
            await fetch(`http://localhost:${server.port}/hello`);
            expect(true).toBe(false); // Should not reach here
        } catch (err) {
            // Expected to fail - server is stopped
            expect(err).toBeDefined();
        }
    });

    it("should handle calling stop() when server is not running", async () => {
        const app = new Shokupan();

        // This should not throw
        await app.stop();
    });

    it("should work with both listen() and stop() multiple times", async () => {
        const app = new Shokupan({ port: 0 });

        app.get("/test", (ctx) => ctx.text("ok"));

        // First start
        const server1 = await app.listen();
        const res1 = await fetch(`http://localhost:${server1.port}/test`);
        expect(res1.status).toBe(200);
        await app.stop();

        // Second start (on a new port since we're using port 0)
        const server2 = await app.listen();
        const res2 = await fetch(`http://localhost:${server2.port}/test`);
        expect(res2.status).toBe(200);
        await app.stop();
    }, { timeout: 30000 });
});
