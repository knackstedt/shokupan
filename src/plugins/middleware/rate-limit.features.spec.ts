import { describe, expect, test } from "bun:test";
import { RateLimitMiddleware } from "./rate-limit";
import { Shokupan } from "../../shokupan";

describe("Rate Limit New Features", () => {

    test("onRateLimited callback (notification only)", async () => {
        const app = new Shokupan();
        let notifiedKey = "";
        let notifiedCtx = false;

        app.use(RateLimitMiddleware({
            limit: 1,
            windowMs: 1000,
            keyGenerator: (ctx) => "test-key-1",
            onRateLimited: (ctx, key) => {
                notifiedKey = key;
                notifiedCtx = !!ctx;
            }
        }));

        app.get("/", (ctx) => ctx.text("ok"));

        // 1 - OK
        await app.testRequest({ method: "GET", url: "/" });

        // 2 - Blocked, should trigger callback
        const res = await app.testRequest({ method: "GET", url: "/" });

        expect(res.status).toBe(429);
        expect(notifiedKey).toBe("test-key-1");
        expect(notifiedCtx).toBe(true);
    });

    test("onRateLimited callback (custom response)", async () => {
        const app = new Shokupan();

        app.use(RateLimitMiddleware({
            limit: 1,
            windowMs: 1000,
            keyGenerator: (ctx) => "test-key-2",
            onRateLimited: (ctx, key) => {
                return ctx.text(`Custom Block: ${key}`, 418);
            }
        }));

        app.get("/", (ctx) => ctx.text("ok"));

        // 1 - OK
        await app.testRequest({ method: "GET", url: "/" });

        // 2 - Blocked, should return custom response
        const res = await app.testRequest({ method: "GET", url: "/" });

        expect(res.status).toBe(418);
        expect(res.data).toBe("Custom Block: test-key-2");
    });

    test("Dynamic Message Function", async () => {
        const app = new Shokupan();

        app.use(RateLimitMiddleware({
            limit: 1,
            windowMs: 1000,
            keyGenerator: (ctx) => "test-key-3",
            message: (ctx, key) => {
                return { error: `Rate limited for key: ${key}` };
            }
        }));

        app.get("/", (ctx) => ctx.text("ok"));

        // 1 - OK
        await app.testRequest({ method: "GET", url: "/" });

        // 2 - Blocked, should return dynamic message
        const res = await app.testRequest({ method: "GET", url: "/" });

        expect(res.status).toBe(429);
        expect(res.data).toEqual({ error: "Rate limited for key: test-key-3" });
    });

});
