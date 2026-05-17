import { describe, expect, test } from "bun:test";
import { serveStatic } from "../../plugins/middleware/serve-static";
import { Shokupan } from "../../shokupan";

describe("Security: Static File & Input Validation", () => {
    describe("CVE-1: Path Traversal Protection", () => {
        test("should block ../  traversal attempts", async () => {
            const app = new Shokupan();
            app.get("/static/*", serveStatic({ root: "./src/test" }, "/static"));

            const res = await app.testRequest({
                path: "/static/../package.json"
            });

            expect([403, 404]).toContain(res.status);
        });

        test("should block encoded path traversal", async () => {
            const app = new Shokupan();
            app.get("/static/*", serveStatic({ root: "./src/test" }, "/static"));

            const res = await app.testRequest({
                path: "/static/%2e%2e/package.json"
            });

            expect([403, 404]).toContain(res.status);
        });

        test("should block null byte injection before decoding", async () => {
            const app = new Shokupan();
            app.get("/static/*", serveStatic({ root: "./src/test" }, "/static"));

            const res = await app.testRequest({
                path: "/static/test%00.txt"
            });

            expect(res.status).toBe(403);
        });

        test("should block double-encoded traversal", async () => {
            const app = new Shokupan();
            app.get("/static/*", serveStatic({ root: "./src/test" }, "/static"));

            const res = await app.testRequest({
                path: "/static/%252e%252e/secret.txt"
            });

            expect([400, 403, 404]).toContain(res.status);
        });

        test("should allow legitimate file access", async () => {
            const app = new Shokupan();
            app.get("/static/*", serveStatic({ root: "./src/test" }, "/static"));

            const res = await app.testRequest({
                path: "/static/static-file-security.spec.ts"
            });

            expect(res.status).toBe(200);
        });
    });

    describe("CVE-4: ReDoS Protection", () => {
        test("should reject paths longer than 2048 characters", () => {
            const app = new Shokupan();

            const longPath = "/" + "a".repeat(2050);

            expect(() => {
                app.get(longPath, (ctx) => ctx.text("ok"));
            }).toThrow("Path too long");
        });

        test("should limit wildcard matching", async () => {
            const app = new Shokupan();

            app.get("/api/*", (ctx) => ctx.text("matched"));

            const res = await app.testRequest({
                path: "/api/" + "x".repeat(300)
            });

            expect(res.status).toBe(200);
        });

        test("should handle multiple param segments without hanging", async () => {
            const app = new Shokupan();

            app.get("/users/:userId/posts/:postId/comments/:commentId", (ctx) => {
                return ctx.json(ctx.params);
            });

            const res = await app.testRequest({
                path: "/users/123/posts/456/comments/789"
            });

            expect(res.status).toBe(200);
            expect(res.data).toMatchObject({
                userId: "123",
                postId: "456",
                commentId: "789"
            });
        });
    });

    describe("CVE-6: Prototype Pollution Protection", () => {
        test("should block __proto__ in query params", async () => {
            const app = new Shokupan();

            app.get("/test", (ctx) => {
                return ctx.json({ query: ctx.query });
            });

            const res = await app.testRequest({
                path: "/test?__proto__[isAdmin]=true"
            });

            expect(res.status).toBe(200);
            const keys = Object.keys(res.data.query);
            expect(keys).not.toContain("__proto__");
        });

        test("should block constructor in query params", async () => {
            const app = new Shokupan();

            app.get("/test", (ctx) => {
                return ctx.json({ query: ctx.query });
            });

            const res = await app.testRequest({
                path: "/test?constructor[prototype][isAdmin]=true"
            });

            expect(res.status).toBe(200);
            const keys = Object.keys(res.data.query);
            expect(keys).not.toContain("constructor");
        });

        test("should block prototype in query params", async () => {
            const app = new Shokupan();

            app.get("/test", (ctx) => {
                return ctx.json({ query: ctx.query });
            });

            const res = await app.testRequest({
                path: "/test?prototype[isAdmin]=true"
            });

            expect(res.status).toBe(200);
            expect(res.data.query).not.toHaveProperty("prototype");
        });

        test("should allow normal query parameters", async () => {
            const app = new Shokupan();

            app.get("/test", (ctx) => {
                return ctx.json({ query: ctx.query });
            });

            const res = await app.testRequest({
                path: "/test?name=John&age=30&isAdmin=false"
            });

            expect(res.status).toBe(200);
            expect(res.data.query.name).toBe("John");
            expect(res.data.query.age).toBe("30");
            expect(res.data.query.isAdmin).toBe("false");
        });
    });
});
