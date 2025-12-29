
import { describe, expect, test } from "bun:test";
import { ShokupanRouter } from '../../router';
import { Shokupan } from '../../shokupan';

describe("Shokupan Direct Testing", () => {
    test("ShokupanRouter.processRequest should return structured result", async () => {
        const router = new ShokupanRouter();
        router.get("/direct", () => ({ msg: "direct" }));
        router.post("/data", async (ctx) => {
            const body = await ctx.req.json();
            return { received: body };
        });

        // Test GET
        const res1 = await router.processRequest({
            path: "/direct",
            method: "GET"
        });

        expect(res1.status).toBe(200);
        expect(res1.data).toEqual({ msg: "direct" });

        // Test POST with body
        const res2 = await router.processRequest({
            path: "/data",
            method: "POST",
            body: { foo: "bar" }
        });

        expect(res2.status).toBe(200);
        expect(res2.data).toEqual({ received: { foo: "bar" } });
    });

    test("Shokupan.processRequest should handle middleware", async () => {
        const app = new Shokupan();

        // Middleware to add header
        app.use(async (ctx, next) => {
            const res = await next();
            if (res instanceof Response) {
                res.headers.set("x-middleware", "true");
                return res;
            }
            // For object returns, we can't easily set headers unless we return Response or Context methods wrapping it.
            // But let's test if side-effect works or if we return different thing.
            return { wrapped: res };
        });

        app.get("/mw", () => "original");

        const res = await app.processRequest({ path: "/mw" });

        expect(res.status).toBe(200);
        // Middleware wrapped the result
        expect(res.data).toEqual({ wrapped: "original" });
    });

    test("Shokupan.processRequest should handle 404", async () => {
        const app = new Shokupan();
        const res = await app.processRequest({ path: "/missing" });
        expect(res.status).toBe(404);
    });
});
