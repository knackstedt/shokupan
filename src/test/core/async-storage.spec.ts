
import { describe, expect, test } from "bun:test";
import { Shokupan } from "../../shokupan";
import { asyncContext } from "../../util/async-hooks";

describe("AsyncLocalStorage Configuration", () => {
    test("should be disabled by default", async () => {
        const app = new Shokupan();
        let store: any;

        app.get("/", () => {
            store = asyncContext.getStore();
            return "OK";
        });

        const res = await app.fetch(new Request("http://localhost/") as any);
        expect(await res.text()).toBe("OK");
        expect(store).toBeUndefined();
    });

    test("should be enabled when configured", async () => {
        const app = new Shokupan({ enableAsyncLocalStorage: true });
        let store: any;

        app.get("/", () => {
            store = asyncContext.getStore();
            return "OK";
        });

        const res = await app.fetch(new Request("http://localhost/") as any);
        expect(await res.text()).toBe("OK");
        expect(store).toBeDefined();
        expect(store).toBeInstanceOf(Map);
    });

    test("should remain disabled if explicitly set to false", async () => {
        const app = new Shokupan({ enableAsyncLocalStorage: false });
        let store: any;

        app.get("/", () => {
            store = asyncContext.getStore();
            return "OK";
        });

        const res = await app.fetch(new Request("http://localhost/") as any);
        expect(await res.text()).toBe("OK");
        expect(store).toBeUndefined();
    });

    test("should persist state across async boundaries", async () => {
        const app = new Shokupan({ enableAsyncLocalStorage: true });

        app.use(async (ctx, next) => {
            const store = asyncContext.getStore();
            store?.set("requestId", "req-123");
            await new Promise(r => setTimeout(r, 10)); // Force async
            return next();
        });

        app.get("/", async () => {
            const store = asyncContext.getStore();
            await new Promise(r => setTimeout(r, 10)); // Force async
            return store?.get("requestId");
        });

        const res = await app.fetch(new Request("http://localhost/") as any);
        expect(await res.text()).toBe("req-123");
    });

    test("should isolate state between concurrent requests", async () => {
        const app = new Shokupan({ enableAsyncLocalStorage: true });

        app.use(async (ctx, next) => {
            const store = asyncContext.getStore();
            const id = new URL(ctx.request.url).searchParams.get("id");
            store?.set("id", id);
            await new Promise(r => setTimeout(r, Math.random() * 20));
            return next();
        });

        app.get("/", async () => {
            const store = asyncContext.getStore();
            return store?.get("id");
        });

        const req1 = app.fetch(new Request("http://localhost/?id=1") as any);
        const req2 = app.fetch(new Request("http://localhost/?id=2") as any);

        const [res1, res2] = await Promise.all([req1, req2]);
        expect(await res1.text()).toBe("1");
        expect(await res2.text()).toBe("2");
    });
});
