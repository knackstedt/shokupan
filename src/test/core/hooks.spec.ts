import { describe, expect, mock, test } from "bun:test";
import { z } from "zod";
import { validate } from "../../plugins/validation";
import { ShokupanRouter } from "../../router";
import { Shokupan } from "../../shokupan";

describe("Event Hooks", () => {

    test("Application Lifecycle Hooks", async () => {
        const app = new Shokupan({
            port: 0,
            hooks: {
                onRequestStart: mock(),
                onRequestEnd: mock(),
                onResponseStart: mock(),
                onResponseEnd: mock(),
            }
        });

        app.get("/test", (ctx) => {
            return ctx.text("ok");
        });

        const res = await app.fetch(new Request("http://localhost/test"));
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("ok");

        expect(app.applicationConfig.hooks!.onRequestStart).toHaveBeenCalled();
        expect(app.applicationConfig.hooks!.onRequestEnd).toHaveBeenCalled();
        expect(app.applicationConfig.hooks!.onResponseStart).toHaveBeenCalled();
        expect(app.applicationConfig.hooks!.onResponseEnd).toHaveBeenCalled();
    });

    test("Application onError Hook", async () => {
        const app = new Shokupan({
            port: 0,
            hooks: {
                onError: mock()
            }
        });

        app.get("/error", () => {
            throw new Error("Boom");
        });

        const res = await app.fetch(new Request("http://localhost/error"));
        expect(res.status).toBe(500);

        expect(app.applicationConfig.hooks!.onError).toHaveBeenCalled();
        const [ctx, err] = (app.applicationConfig.hooks!.onError as any).mock.calls[0];
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe("Boom");
    });

    test("Validation Hooks", async () => {
        const beforeValidate = mock();
        const afterValidate = mock();

        const app = new Shokupan({
            port: 0,
            hooks: {
                beforeValidate,
                afterValidate
            }
        });

        const schema = z.object({
            name: z.string()
        });

        app.post("/validate", validate({ body: schema }), (ctx) => {
            return ctx.json(ctx.body);
        });

        const res = await app.fetch(new Request("http://localhost/validate", {
            method: "POST",
            body: JSON.stringify({ name: "Shokupan" }),
            headers: { "Content-Type": "application/json" }
        }));

        expect(res.status).toBe(200);

        expect(beforeValidate).toHaveBeenCalled();
        expect(afterValidate).toHaveBeenCalled();

        // Check data passed to hooks
        const [ctx1, data1] = beforeValidate.mock.calls[0];
        expect(data1.body).toEqual({ name: "Shokupan" }); // Raw body

        const [ctx2, data2] = afterValidate.mock.calls[0];
        expect(data2.body).toEqual({ name: "Shokupan" }); // Validated body
    });

    test("Router Hooks (Onion Model)", async () => {
        const order: string[] = [];

        const subRouter = new ShokupanRouter({
            hooks: {
                onRequestStart: () => { order.push("router-start"); },
                onRequestEnd: () => { order.push("router-end"); },
            }
        });

        subRouter.get("/sub", () => {
            order.push("handler");
            return "ok";
        });

        const app = new Shokupan({
            port: 0,
            hooks: {
                onRequestStart: () => { order.push("app-start"); },
                onRequestEnd: () => { order.push("app-end"); },
            }
        });

        app.mount("/api", subRouter);

        const res = await app.fetch(new Request("http://localhost/api/sub"));
        expect(res.status).toBe(200);

        // Expected order: App Start -> Router Start -> Handler -> Router End -> App End
        expect(order).toEqual([
            "app-start",
            "router-start",
            "handler",
            "router-end",
            "app-end"
        ]);
    });

    test("Router Error Hook", async () => {
        const routerError = mock();
        const appError = mock();

        const subRouter = new ShokupanRouter({
            hooks: {
                onError: routerError
            }
        });

        subRouter.get("/fail", () => {
            throw new Error("Router Fail");
        });

        const app = new Shokupan({
            port: 0,
            hooks: {
                onError: appError
            }
        });

        app.mount("/api", subRouter);

        const res = await app.fetch(new Request("http://localhost/api/fail"));
        expect(res.status).toBe(500);

        expect(routerError).toHaveBeenCalled();
        expect(appError).toHaveBeenCalled(); // Both should be called as router re-throws
    });

    test("Request Timeout Hook", async () => {
        const onTimeout = mock();
        const app = new Shokupan({
            port: 0,
            requestTimeout: 100, // 100ms
            hooks: {
                onRequestTimeout: onTimeout
            }
        });

        app.get("/slow", async () => {
            await new Promise(r => setTimeout(r, 200));
            return "slow";
        });

        const res = await app.fetch(new Request("http://localhost/slow"));

        // Should return 408 Request Timeout (handled by us)
        expect(res.status).toBe(408);
        expect(await res.text()).toBe("Request Timeout");

        expect(onTimeout).toHaveBeenCalled();
    });
});
