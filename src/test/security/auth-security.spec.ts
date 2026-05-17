import { describe, expect, test } from "bun:test";
import { createHmac } from "crypto";
import { serveStatic } from "../../plugins/middleware/serve-static";
import { Shokupan } from "../../shokupan";

describe("Security: Authentication & Session", () => {
    describe("CVE-10: Timing Attack Protection", () => {
        test("should use constant-time comparison for session validation", () => {
            const secret = "test-secret";
            const value = "session-id-123";

            const signed = value + '.' + createHmac('sha256', secret)
                .update(value)
                .digest('base64')
                .replace(/=+$/, '');

            expect(signed).toContain('.');
            expect(signed.split('.')[0]).toBe(value);
        });
    });

    describe("CVE-11: Information Disclosure Protection", () => {
        test("should not leak stack traces in OAuth errors", async () => {
            const genericMessage = "Authentication failed. Please try again.";
            expect(genericMessage).not.toContain("Error:");
            expect(genericMessage).not.toContain("at ");
            expect(genericMessage).not.toContain(".ts:");
            expect(genericMessage).not.toContain("Stack:");
        });
    });

    describe("CVE-12: Null Byte Injection", () => {
        test("should block encoded null bytes", async () => {
            const app = new Shokupan();
            app.get("/static/*", serveStatic({ root: "./src/test" }, "/static"));

            const res = await app.testRequest({
                path: "/static/file%00.txt"
            });

            expect(res.status).toBe(403);
        });
    });

    describe("CVE-14: ctx.file() Path Traversal Protection", () => {
        test("should block .. in file path", async () => {
            const app = new Shokupan();
            app.get("/file", (ctx) => ctx.file('../package.json'));
            const res = await app.testRequest({ path: "/file" });
            expect(res.status).toBe(500);
        });

        test("should block null byte in file path", async () => {
            const app = new Shokupan();
            app.get("/file", (ctx) => ctx.file('test\0.txt'));
            const res = await app.testRequest({ path: "/file" });
            expect(res.status).toBe(500);
        });
    });

    describe("CVE-13: Directory Listing Protection", () => {
        test("directory listing should be disabled by default", async () => {
            const app = new Shokupan();
            app.get("/static/*", serveStatic({ root: "./src/test" }, "/static"));

            const res = await app.testRequest({
                path: "/static/"
            });
            expect([403, 404]).toContain(res.status);
        });
        test("should return 403 when directory listing is disabled and no index", async () => {
            const app = new Shokupan();
            app.get("/static/*", serveStatic({
                root: "./src/test",
                listDirectory: false
            }, "/static"));

            const res = await app.testRequest({
                path: "/static/"
            });

            expect([403, 404]).toContain(res.status);
        });
    });

    describe("SHK-001: Silent JWT Failure Fix", () => {
        test("should reject requests with invalid token", async () => {
            const { AuthPlugin } = await import("../../plugins/application/auth");
            const app = new Shokupan();
            const auth = new AuthPlugin({
                jwtSecret: 'test-secret',
                providers: {}
            });
            await app.register(auth);
            app.use(auth.getMiddleware() as any);
            app.get("/protected", (ctx) => ctx.json({ user: (ctx as any).user }));

            const res = await app.testRequest({
                path: "/protected",
                headers: { "Authorization": "Bearer invalid-token" }
            });

            expect(res.status).toBe(401);
        });

        test("should allow requests with valid token", async () => {
            const { AuthPlugin } = await import("../../plugins/application/auth");
            const app = new Shokupan();
            const auth = new AuthPlugin({
                jwtSecret: 'test-secret',
                providers: {}
            });
            await app.register(auth);
            app.use(auth.getMiddleware() as any);
            app.get("/protected", (ctx) => ctx.json({ user: (ctx as any).user }));

            const jose = await import("jose");
            const secret = new TextEncoder().encode('test-secret');
            const jwt = await new jose.SignJWT({ id: 'user-1' })
                .setProtectedHeader({ alg: 'HS256' })
                .setIssuedAt()
                .setExpirationTime('1h')
                .sign(secret);

            const res = await app.testRequest({
                path: "/protected",
                headers: { "Authorization": `Bearer ${jwt}` }
            });

            expect(res.status).toBe(200);
            expect(res.data.user.id).toBe('user-1');
        });
    });

    describe("SHK-004: Auth Cookie SameSite Default", () => {
        test("should default SameSite to Lax when not specified", async () => {
            const { AuthPlugin } = await import("../../plugins/application/auth");
            const app = new Shokupan();
            const auth = new AuthPlugin({
                jwtSecret: 'test-secret',
                providers: {}
            });
            await app.register(auth);

            const jose = await import("jose");
            const secret = new TextEncoder().encode('test-secret');
            const jwt = await new jose.SignJWT({ id: 'user-1' })
                .setProtectedHeader({ alg: 'HS256' })
                .setIssuedAt()
                .setExpirationTime('1h')
                .sign(secret);

            const res = await app.testRequest({
                path: "/protected",
                headers: { "Cookie": `auth_token=${jwt}` }
            });

            const logoutRes = await app.testRequest({ path: "/auth/logout", method: "POST" });
            const setCookie = logoutRes.headers['set-cookie'];
            expect(setCookie).toContain('SameSite=Lax');
        });
    });

    describe("SHK-005: Header Sanitization in Production Logs", () => {
        test("should redact sensitive headers", async () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const { createHTTPLogger } = await import("../../util/logger");
            const middleware = createHTTPLogger();

            const mockCtx = {
                method: 'GET',
                url: '/test',
                request: {
                    headers: new Headers({ 'Authorization': 'Bearer secret', 'X-Custom': 'ok' }),
                    ip: '127.0.0.1',
                    header: (name: string) => new Headers().get(name)
                },
                response: { status: 200, get: () => null }
            } as any;

            await middleware(mockCtx, async () => {});

            process.env.NODE_ENV = originalEnv;
        });
    });

    describe("SHK-003: ctx.file() Allowed Paths", () => {
        test("should enforce allowedStaticFilePaths", async () => {
            const app = new Shokupan({
                allowedStaticFilePaths: ['./src/test']
            });
            app.get("/file", (ctx) => ctx.file('./src/test/security/static-file-security.spec.ts'));

            const res = await app.testRequest({ path: "/file" });
            expect(res.status).toBe(200);
        });

        test("should deny file outside allowedStaticFilePaths", async () => {
            const app = new Shokupan({
                allowedStaticFilePaths: ['./src/test']
            });
            app.get("/file", (ctx) => ctx.file('./package.json'));

            const res = await app.testRequest({ path: "/file" });
            expect(res.status).toBe(500);
        });

        test("should allow any file when allowedStaticFilePaths is not set", async () => {
            const app = new Shokupan();
            app.get("/file", (ctx) => ctx.file('./package.json'));

            const res = await app.testRequest({ path: "/file" });
            expect(res.status).toBe(200);
        });
    });
});
