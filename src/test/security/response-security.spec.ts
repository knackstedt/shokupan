import { describe, expect, it } from "bun:test";
import { Shokupan } from "../../shokupan";

describe("Security: Response Security", () => {
    describe("Security Headers on POJO Response", () => {
        it("should apply security headers when handler returns POJO", async () => {
            const app = new Shokupan({
                defaultSecurityHeaders: true
            });

            app.get('/json', (ctx) => {
                return { message: 'hello' };
            });

            const res = await app.testRequest({ path: '/json' });

            expect(res.headers['content-security-policy']).toBeDefined();

            await app.stop();
        });

        it("should apply security headers if handler returns Response object", async () => {
            const app = new Shokupan({
                defaultSecurityHeaders: {
                    contentSecurityPolicy: true
                }
            });

            app.get('/response', (ctx) => {
                return ctx.text('hello');
            });

            const res = await app.testRequest({ path: '/response' });
            expect(res.headers['content-security-policy']).toBeDefined();
            await app.stop();
        });
    });

    describe("Error Masking in Production", () => {
        it("should NOT leak error message in production mode by default", async () => {
            const app = new Shokupan({
                development: false
            });

            app.get('/error', (ctx) => {
                throw new Error("Sensitive Database Connection Failed");
            });

            const res = await app.testRequest({ path: '/error' });
            const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

            expect(body.error).not.toBe("Sensitive Database Connection Failed");
            expect(body.error).toBe("Internal Server Error");
            expect(res.status).toBe(500);

            await app.stop();
        });

        it("should mask error details in production", async () => {
            const app = new Shokupan({
                development: false
            });

            app.get('/error', (ctx) => {
                throw new Error("Sensitive Internal Info");
            });

            const res = await app.testRequest({ path: '/error' });
            expect(res.data.error).toBe("Internal Server Error");
            await app.stop();
        });
    });
});
