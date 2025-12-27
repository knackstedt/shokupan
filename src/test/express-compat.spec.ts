
import { describe, expect, it } from "bun:test";
import { useExpress } from '../plugins/express';
import { Shokupan } from '../shokupan';

describe("Express Compatibility", () => { // Skipping initially until implementation is ready or to run manually
    it("should propagate req mutations to ctx.state", async () => {
        const app = new Shokupan<{ testProp: string; }>({ port: 0 });

        // Middleware that writes to req
        app.use(useExpress((req: any, res: any, next: any) => {
            req.testProp = "mutated";
            next();
        }));

        app.get("/test-mutation", (ctx) => {
            return { prop: ctx.state.testProp };
        });

        const server = app.listen();
        const res = await fetch(`http://localhost:${server.port}/test-mutation`);
        const data = await res.json();

        expect(data).toEqual({ prop: "mutated" });
        server.stop();
    });

    it("should redirect res.set to response headers", async () => {
        const app = new Shokupan();

        // Middleware that sets header
        app.use(useExpress((req: any, res: any, next: any) => {
            res.set("x-custom-header", "custom-value");
            res.setHeader("x-another-header", "another-value"); // Test alias/alternative too if possible
            next();
        }));

        app.get("/test-headers", (ctx) => {
            return "ok";
        });

        const server = app.listen();
        const res = await fetch(`http://localhost:${server.port}/test-headers`);

        expect(res.headers.get("x-custom-header")).toBe("custom-value");
        expect(res.headers.get("x-another-header")).toBe("another-value");
        server.stop();
    });
});
