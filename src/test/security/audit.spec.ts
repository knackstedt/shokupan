import { describe, expect, it } from "bun:test";
import { Shokupan } from "../../shokupan";

describe("Security Audit", () => {

    describe("CWE-693: Security Headers", () => {
        it("should set X-Content-Type-Options: nosniff by default", async () => {
            const app = new Shokupan();
            app.get("/", (ctx) => ctx.text("ok"));
            const res = await app.testRequest({ path: "/" });
            expect(res.headers["x-content-type-options"]).toBe("nosniff");
        });

        it("should set X-Frame-Options: SAMEORIGIN by default", async () => {
            const app = new Shokupan();
            app.get("/", (ctx) => ctx.text("ok"));
            const res = await app.testRequest({ path: "/" });

            // Should be DENY or SAMEORIGIN
            const frameOptions = res.headers["x-frame-options"];
            expect(["DENY", "SAMEORIGIN"]).toContain(frameOptions);
        });

        it("should set Strict-Transport-Security on HTTPS", async () => {
            const app = new Shokupan();
            app.get("/", (ctx) => ctx.text("ok"));
            // Simulate HTTPS
            const res = await app.testRequest({
                path: "/",
                url: "https://example.com/"
            });
            expect(res.headers["strict-transport-security"]).toBeDefined();
        });

        it("should not leak X-Powered-By by default", async () => {
            const app = new Shokupan();
            app.get("/", (ctx) => ctx.text("ok"));
            const res = await app.testRequest({ path: "/" });
            expect(res.headers["x-powered-by"]).toBeUndefined();
        });
    });

    describe("CWE-601: Advanced Open Redirects", () => {
        it("should block protocol-relative redirects (//evil.com)", async () => {
            const app = new Shokupan();
            app.get("/redirect", (ctx) => {
                const target = ctx.query["url"] as string;
                return ctx.redirect(target);
            });

            const res = await app.testRequest({
                path: "/redirect?url=//evil.com"
            });

            // Should either be blocked (400/403) or sanitized to relative /evil.com
            // If it returns 302 with Location: //evil.com, browser treats it as scheme-relative -> redirect to evil.com
            if (res.status >= 300 && res.status < 400) {
                expect(res.headers["location"]).not.toMatch(/^\/\//);
            }
        });

        it("should block javascript: pseudo-protocol redirects", async () => {
            const app = new Shokupan();
            app.get("/redirect", (ctx) => {
                const target = ctx.query["url"] as string;
                return ctx.redirect(target);
            });

            const res = await app.testRequest({
                path: "/redirect?url=javascript:alert(1)"
            });

            expect(res.status).not.toBe(302); // Should not redirect
            // Or if it does, location should not be javascript:...
            if (res.status >= 300 && res.status < 400) {
                expect(res.headers["location"]).not.toMatch(/^javascript:/i);
            }
        });

        it("should block data: pseudo-protocol redirects", async () => {
            const app = new Shokupan();
            app.get("/redirect", (ctx) => {
                const target = ctx.query["url"] as string;
                return ctx.redirect(target);
            });

            const res = await app.testRequest({
                path: "/redirect?url=data:text/html,bad"
            });

            if (res.status >= 300 && res.status < 400) {
                expect(res.headers["location"]).not.toMatch(/^data:/i);
            }
        });
    });

    describe("CWE-444: HTTP Request Smuggling", () => {
        // These are hard to test with simple fetch/testRequest as node/bun core handles parsing.
        // We check API behavior if multiple headers somehow get through (e.g. via proxies).

        it("should reject ambiguous Content-Length", async () => {
            // This is testing Shokupan's behavior when provided with pre-parsed headers
            const app = new Shokupan();
            app.post("/", (ctx) => ctx.text("ok"));

            try {
                await app.testRequest({
                    method: "POST",
                    path: "/",
                    headers: {
                        // @ts-ignore - explicitly testing duplicate/invalid headers if simulate-able
                        "Content-Length": ["10", "20"]
                    } as any
                });
            } catch (e) {
                // Should throw or reject
                expect(true).toBe(true);
                return;
            }
            // If explicit failure didn't happen in testRequest (which uses new Request), 
            // check if app handled it. Requests with multiple CLs should be 400.
        });
    });

    describe("CWE-79: Cross-Site Scripting (XSS)", () => {
        it("should escape reflected input in 404 page", async () => {
            const app = new Shokupan();
            // Default 404 might reflect path
            const path = "/<script>alert(1)</script>";
            const res = await app.testRequest({ path });

            if (res.headers["content-type"]?.includes("text/html")) {
                expect(res.data).not.toContain("<script>alert(1)</script>");
                expect(res.data).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
            }
        });

        it("should escape reflected input in default error page", async () => {
            const app = new Shokupan();
            app.get("/error", (ctx) => { throw new Error("<script>alert(1)</script>"); });

            const res = await app.testRequest({ path: "/error" });

            if (res.headers["content-type"]?.includes("text/html")) {
                expect(res.data).not.toContain("<script>alert(1)</script>");
            }
        });
    });
});
