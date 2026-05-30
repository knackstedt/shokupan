import { describe, expect, test } from "bun:test";
import { Shokupan } from "../shokupan";

describe("Middleware next() return value propagation", () => {
    test("should return handler result even when middleware does not return next()", async () => {
        const app = new Shokupan({ development: false });
        app.use(async (ctx, next) => {
            await next();
            // Intentionally not returning next()
        });
        app.get('/test', () => ({ message: 'hello' }));

        const res = await app.testRequest({ path: '/test' });
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ message: 'hello' });
    });

    test("should return handler result with middleware tracking enabled and no return", async () => {
        const app = new Shokupan({ development: true, enableMiddlewareTracking: true });
        app.use(async (ctx, next) => {
            await next();
            // Intentionally not returning next()
        });
        app.get('/test', () => ({ message: 'tracked' }));

        const res = await app.testRequest({ path: '/test' });
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ message: 'tracked' });
    });

    test("should return handler result when multiple middleware do not return next()", async () => {
        const app = new Shokupan({ development: false });
        app.use(async (ctx, next) => { await next(); });
        app.use(async (ctx, next) => { await next(); });
        app.get('/test', () => ({ message: 'chain' }));

        const res = await app.testRequest({ path: '/test' });
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ message: 'chain' });
    });

    test("should return 204 when handler returns void and middleware does not return next()", async () => {
        const app = new Shokupan({ development: false });
        app.use(async (ctx, next) => {
            await next();
        });
        app.get('/test', () => {
            // void return
        });

        const res = await app.testRequest({ path: '/test' });
        expect(res.status).toBe(204);
    });
});
