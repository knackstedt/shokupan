
import { describe, expect, it } from "bun:test";
import { Compression } from "../src/plugins/compression";
import { Shokupan } from "../src/shokupan";

describe("Compression Middleware Reproduction", () => {
    it("should compress response when handler returns ctx.text()", async () => {
        const app = new Shokupan();
        app.use(Compression());

        app.get("/valid", (ctx) => {
            return ctx.text("Hello World".repeat(100));
        });

        const res = await app.fetch(new Request("http://localhost/valid", {
            headers: { "Accept-Encoding": "gzip" }
        }));

        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Encoding")).toBe("gzip");
    });

    it("should fail (or return undefined/404?) when handler does NOT return ctx.text()", async () => {
        const app = new Shokupan();
        app.use(Compression());

        app.get("/void", (ctx) => {
            ctx.text("Hello World".repeat(100));
            // Implicitly returns undefined
        });

        const res = await app.fetch(new Request("http://localhost/void", {
            headers: { "Accept-Encoding": "gzip" }
        }));

        // If next() returns undefined, Compression middleware goes to 'debugger' line
        // and returns original 'response' variable (which is undefined? wait no)
        // In compression.ts: const response = await next();
        // If next() returns undefined, response is undefined.
        // Then: if (response instanceof Response) -> false.
        // else -> debugger; return response; (returns undefined).
        // 
        // If middleware returns undefined, what does Shokupan.handle do?
        // In Shokupan.handleRequest (which calls router.processRequest? No, app.handle calls app.processRequest?)

        // If the whole chain returns undefined, the final response is undefined?
        // Usually framework handles that (e.g. 404 Not Found if no result).

        expect(res).toBeDefined();
        // We expect it to be 404 or something, but if it crashes or returns undefined, we want to know.
    });
});
