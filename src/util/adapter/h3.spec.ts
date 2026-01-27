import { describe, expect, it } from "bun:test";
import { Shokupan } from "../../shokupan";

describe("H3 Adapter", () => {
    it("should support swapping the server engine to h3", async () => {
        const app = new Shokupan({
            port: 0,
            adapter: 'h3'
        });

        app.get("/", ctx => ctx.text("Hello from H3"));
        app.get("/json", ctx => ctx.json({ message: "H3 adapter works!" }));

        const server = await app.listen();
        expect(server.port).toBeGreaterThan(0);

        const res = await fetch(`http://${server.hostname}:${server.port}/`);
        expect(await res.text()).toBe("Hello from H3");

        const jsonRes = await fetch(`http://${server.hostname}:${server.port}/json`);
        const json = await jsonRes.json();
        expect(json).toEqual({ message: "H3 adapter works!" });

        await server.stop();
    });

    it("should support POST requests with body parsing", async () => {
        const app = new Shokupan({
            port: 0,
            adapter: 'h3'
        });

        app.post("/echo", async ctx => {
            const body = await ctx.body();
            return ctx.json(body);
        });

        const server = await app.listen();

        const res = await fetch(`http://${server.hostname}:${server.port}/echo`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ test: 'data' })
        });

        const json = await res.json();
        expect(json).toEqual({ test: 'data' });

        await server.stop();
    });

    it("should handle middleware correctly", async () => {
        const app = new Shokupan({
            port: 0,
            adapter: 'h3'
        });

        // Add middleware
        app.use(async (ctx, next) => {
            (ctx.state as any).middlewareRan = true;
            await next();
        });

        app.get("/", ctx => {
            return ctx.json({ middlewareRan: (ctx.state as any).middlewareRan });
        });

        const server = await app.listen();

        const res = await fetch(`http://${server.hostname}:${server.port}/`);
        const json = await res.json();
        expect(json.middlewareRan).toBe(true);

        await server.stop();
    });
});
