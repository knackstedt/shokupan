
import { describe, expect, it } from 'bun:test';
import { Shokupan } from '../shokupan';

describe('Security Audit Fixes', () => {

    it('should apply security headers when handler returns POJO', async () => {
        const app = new Shokupan({
            securityHeaders: {
                contentSecurityPolicy: true
            }
        });

        app.get('/json', (ctx) => {
            return { message: 'hello' };
        });

        const res = await app.testRequest({ path: '/json' });

        // This expectation asserts the FIX
        expect(res.headers['content-security-policy']).toBeDefined();

        await app.stop();
    });

    it('should NOT leak error message in production mode by default', async () => {
        const app = new Shokupan({
            development: false
        });

        app.get('/error', (ctx) => {
            throw new Error("Sensitive Database Connection Failed");
        });

        const res = await app.testRequest({ path: '/error' });
        const body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

        // Expect generic error message
        expect(body.error).not.toBe("Sensitive Database Connection Failed");
        expect(body.error).toBe("Internal Server Error");
        expect(res.status).toBe(500);

        await app.stop();
    });

    it('should apply security headers if handler returns Response object', async () => {
        const app = new Shokupan({
            securityHeaders: {
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
