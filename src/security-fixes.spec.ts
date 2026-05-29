import { describe, expect, test } from "bun:test";
import { ShokupanContext } from "./context";
import { Dashboard } from "./plugins/application/dashboard/plugin";
import { Shokupan } from "./shokupan";

describe("Security Fixes", () => {
    describe("Cookie Domain Validation", () => {
        test("should allow exact host match", () => {
            const req = new Request("http://example.com:3000/test");
            const ctx = new ShokupanContext(req as any);
            expect(() => ctx.setCookie("session", "123", { domain: "example.com" })).not.toThrow();
        });

        test("should reject overly broad TLD domains like .com", () => {
            const req = new Request("http://evil.com:3000/test");
            const ctx = new ShokupanContext(req as any);
            expect(() => ctx.setCookie("session", "123", { domain: ".com" })).toThrow(/Invalid cookie domain/);
        });

        test("should reject single-segment parent domains", () => {
            const req = new Request("http://localhost:3000/test");
            const ctx = new ShokupanContext(req as any);
            expect(() => ctx.setCookie("session", "123", { domain: ".localhost" })).toThrow(/Invalid cookie domain/);
        });

        test("should allow valid parent domain", () => {
            const req = new Request("http://app.example.com:3000/test");
            const ctx = new ShokupanContext(req as any);
            expect(() => ctx.setCookie("session", "123", { domain: ".example.com" })).not.toThrow();
        });
    });

    describe("Dashboard Replay SSRF Protection", () => {
        test("should block localhost", () => {
            const result = Dashboard.validateReplayUrl("http://localhost/test", "/dashboard");
            expect(result.error).toBe("Cannot replay to internal addresses");
        });

        test("should block 127.0.0.1", () => {
            const result = Dashboard.validateReplayUrl("http://127.0.0.1/test", "/dashboard");
            expect(result.error).toBe("Cannot replay to internal addresses");
        });

        test("should block numeric IP representations", () => {
            // Bun's URL parser normalizes 0x7f000001 to 127.0.0.1, which is then caught by the private IP check.
            // Other runtimes that don't normalize will hit the numeric IP check.
            const result = Dashboard.validateReplayUrl("http://0x7f000001/test", "/dashboard");
            expect(result.error).toMatch(/Cannot replay to internal addresses|Numeric IP addresses are not allowed/);
        });

        test("should block IPv6 loopback", () => {
            const result = Dashboard.validateReplayUrl("http://[::1]/test", "/dashboard");
            expect(result.error).toBe("Cannot replay to internal addresses");
        });

        test("should block IPv6 private addresses", () => {
            const result = Dashboard.validateReplayUrl("http://[fe80::1]/test", "/dashboard");
            expect(result.error).toBe("Cannot replay to internal addresses");
        });

        test("should block file protocol", () => {
            const result = Dashboard.validateReplayUrl("file:///etc/passwd", "/dashboard");
            expect(result.error).toBe("Invalid protocol");
        });

        test("should allow public hostname", () => {
            const result = Dashboard.validateReplayUrl("https://example.com/api", "/dashboard");
            expect(result.error).toBeUndefined();
        });
    });

    describe("Redirect Protocol Blocking", () => {
        test("should block javascript: protocol", async () => {
            const req = new Request("http://localhost/");
            const ctx = new ShokupanContext(req as any);
            await expect(ctx.redirect("javascript:alert(1)")).rejects.toThrow(/Unsafe protocol/);
        });

        test("should block data: protocol", async () => {
            const req = new Request("http://localhost/");
            const ctx = new ShokupanContext(req as any);
            await expect(ctx.redirect("data:text/html,<script>alert(1)</script>")).rejects.toThrow(/Unsafe protocol/);
        });

        test("should block file: protocol", async () => {
            const req = new Request("http://localhost/");
            const ctx = new ShokupanContext(req as any);
            await expect(ctx.redirect("file:///etc/passwd")).rejects.toThrow(/Unsafe protocol/);
        });

        test("should block chrome-extension: protocol", async () => {
            const req = new Request("http://localhost/");
            const ctx = new ShokupanContext(req as any);
            await expect(ctx.redirect("chrome-extension://foo")).rejects.toThrow(/Unsafe protocol/);
        });

        test("should block protocol-relative URLs", async () => {
            const req = new Request("http://localhost/");
            const ctx = new ShokupanContext(req as any);
            await expect(ctx.redirect("//evil.com")).rejects.toThrow(/Protocol-relative URLs/);
        });

        test("should allow valid https URL", async () => {
            const req = new Request("http://localhost/");
            const ctx = new ShokupanContext(req as any);
            const res = await ctx.redirect("https://example.com");
            expect(res.headers.get("location")).toBe("https://example.com");
        });
    });

    describe("Development Mode Error Masking", () => {
        test("should mask error details when development is not explicitly true", async () => {
            const app = new Shokupan({ development: undefined as any });
            app.get("/error", () => {
                throw new Error("Secret internals");
            });
            const res = await app.testRequest({ path: "/error" });
            expect(res.status).toBe(500);
            expect(res.data.error).toBe("Internal Server Error");
            expect(res.data.stack).toBeUndefined();
        });

        test("should show error details when development is explicitly true", async () => {
            const app = new Shokupan({ development: true });
            app.get("/error", () => {
                const err = new Error("Secret internals") as any;
                err.stack = "at line 1";
                throw err;
            });
            const res = await app.testRequest({ path: "/error" });
            expect(res.status).toBe(500);
            expect(res.data.error).toBe("Secret internals");
            expect(res.data.stack).toBe("at line 1");
        });
    });

    describe("Composed Middleware Cache Invalidation", () => {
        test("should invalidate composedMiddleware when use() is called after first request", async () => {
            const app = new Shokupan();
            let first = false;
            app.get("/test", () => "ok");

            // First request compiles the middleware cache
            const res1 = await app.testRequest({ path: "/test" });
            expect(res1.data).toBe("ok");

            // Add new middleware dynamically
            let middlewareRan = false;
            app.use(async (ctx, next) => {
                middlewareRan = true;
                return next();
            });

            // The new middleware should run on the next request
            const res2 = await app.testRequest({ path: "/test" });
            expect(res2.data).toBe("ok");
            expect(middlewareRan).toBe(true);
        });
    });

    describe("Chunked Body Rejection", () => {
        test("should reject chunked requests by default", async () => {
            const app = new Shokupan();
            app.post("/upload", async (ctx) => {
                return ctx.json({ received: true });
            });

            const req = new Request("http://localhost/upload", {
                method: "POST",
                headers: {
                    "transfer-encoding": "chunked",
                    "content-type": "application/json"
                },
                body: JSON.stringify({ test: true })
            });

            const res = await app.fetch(req);
            expect(res!.status).toBe(411);
        });

        test("should allow chunked requests when explicitly enabled", async () => {
            const app = new Shokupan({ allowChunkedBody: true });
            app.post("/upload", async (ctx) => {
                return ctx.json({ received: true });
            });

            const req = new Request("http://localhost/upload", {
                method: "POST",
                headers: {
                    "transfer-encoding": "chunked",
                    "content-type": "application/json"
                },
                body: JSON.stringify({ test: true })
            });

            const res = await app.fetch(req);
            expect(res!.status).toBe(200);
        });
    });
});
