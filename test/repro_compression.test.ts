
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

        expect(res).toBeDefined();
        // We expect it to be 404 or something, but if it crashes or returns undefined, we want to know.
    });
});
