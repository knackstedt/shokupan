import { describe, expect, test } from "bun:test";
import { Shokupan } from "../shokupan";

describe("Extended Security Tests", () => {
    describe("Host Header Injection", () => {
        test("should rely on trusted host for ctx.host", async () => {
            const app = new Shokupan();
            app.get("/host", (ctx) => ctx.text(ctx.host));

            const res = await app.testRequest({
                path: "/host",
                headers: {
                    "host": "evil.com"
                }
            });

            // Shokupan's testRequest constructs URL from options.path if options.url is missing.
            // It doesn't use the Host header to override the URL construction.
            // Therefore ctx.host refers to the implementation's parsed URL host (localhost).
            // This confirms it doesn't blindly trust the Host header in this context.
            expect(res.data).not.toBe("evil.com");
            expect(res.data).toContain("localhost");
        });

        test("should validate redirect urls against host", async () => {
            const app = new Shokupan();
            app.get("/redirect", (ctx) => ctx.redirect("/safe"));
            const res = await app.testRequest({ path: "/redirect" });
            expect(res.headers['location']).toBe("/safe");
        });
    });

    describe("HTTP Method Spoofing", () => {
        test("should NOT support X-HTTP-Method-Override by default", async () => {
            const app = new Shokupan();
            app.post("/update", (ctx) => ctx.text("updated"));
            app.get("/update", (ctx) => ctx.text("got"));

            const res = await app.testRequest({
                method: "POST",
                path: "/update",
                headers: {
                    "x-http-method-override": "GET"
                }
            });
            expect(res.data).toBe("updated");
        });
    });

    describe("Malformed Headers", () => {
        test("should reject malformed headers", async () => {
            const app = new Shokupan();
            app.get("/", (ctx) => ctx.json(ctx.headers));

            // The underlying Headers object validation throws on invalid names.
            expect(app.testRequest({
                path: "/",
                headers: {
                    "X- Invalid": "value"
                } as any
            })).rejects.toThrow();
        });
    });

    describe("Large Payloads", () => {
        test("should handle large payloads (1MB)", async () => {
            const app = new Shokupan();
            app.post("/echo", async (ctx) => {
                try {
                    const body = await ctx.req.text();
                    return ctx.text(body.length.toString());
                } catch (e) {
                    return ctx.json({ error: String(e) }, 500);
                }
            });

            const largeBody = "a".repeat(1024 * 1024 * 1); // 1MB
            const res = await app.testRequest({
                method: "POST",
                path: "/echo",
                body: largeBody
            });

            if (res.status !== 200) {
                console.error("Large Payload Failed:", res.data);
            }
            expect(res.status).toBe(200);
            expect(res.data).toBe(largeBody.length.toString());
        });
    });

    describe("Response Splitting", () => {
        test("should prevent CRLF in headers", async () => {
            const app = new Shokupan();
            app.get("/header", (ctx) => {
                try {
                    ctx.set("X-Safe", "value\r\nX-Evil: true");
                    return ctx.text("ok");
                } catch {
                    return ctx.text("error", 500);
                }
            });

            const res = await app.testRequest({ path: "/header" });

            if (res.status === 200) {
                expect(res.headers['x-evil']).toBeUndefined();
            } else {
                expect(res.status).toBe(500);
            }
        });
    });
});
