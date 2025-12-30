
import { describe, expect, test } from "bun:test";
import { ShokupanContext } from "../../context";
import { Shokupan } from "../../shokupan";

describe("Middleware Tracking", () => {
    test("should track handlers and state changes when enabled", async () => {
        const app = new Shokupan({
            enableMiddlewareTracking: true,
            port: 0
        });

        const middleware = async (ctx: ShokupanContext, next: any) => {
            ctx.state.foo = "bar";
            await next();
        };

        app.use(middleware);

        app.get("/tracking", async (ctx) => {
            ctx.state.baz = "qux";
            return ctx.json({ stack: ctx.handlerStack });
        });

        const server = await app.listen(0);
        const port = server.port;
        const res = await fetch(`http://localhost:${port}/tracking`);
        const data = await res.json();

        server.stop();

        expect(res.status).toBe(200);
        expect(data.stack).toBeDefined();
        expect(Array.isArray(data.stack)).toBe(true);
        expect(data.stack.length).toBeGreaterThanOrEqual(2); // Middleware + Handler

        // Verify Middleware Entry
        const mwEntry = data.stack.find((h: any) => h.name === "middleware");
        expect(mwEntry).toBeDefined();
        expect(mwEntry.stateChanges).toEqual({ foo: "bar" });
        expect(mwEntry.file).toBeDefined();
        expect(mwEntry.line).toBeGreaterThan(0);

        // Verify Handler Entry
        // The handler is anonymous in the test usually, or might be named if we defined it
        // The last entry should be the handler
        const handlerEntry = data.stack[data.stack.length - 1];
        expect(handlerEntry).toBeDefined();
        expect(handlerEntry.stateChanges).toEqual({ baz: "qux" });
        expect(handlerEntry.file).toBeDefined();
    });

    test("should NOT track when disabled", async () => {
        const app = new Shokupan({
            enableMiddlewareTracking: false,
            port: 0
        });

        app.get("/no-tracking", (ctx) => {
            return ctx.json({ stack: ctx.handlerStack });
        });

        const server = await app.listen(0);
        const port = server.port;
        const res = await fetch(`http://localhost:${port}/no-tracking`);
        const data = await res.json();

        server.stop();

        expect(res.status).toBe(200);
        expect(data.stack).toBeDefined();
        expect(data.stack.length).toBe(0);
    });
});
