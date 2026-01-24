
import { describe, expect, it } from 'bun:test';
import { Shokupan } from '../shokupan';

describe('Security Remediation Verification', () => {

    it('SHK-001: Should apply security headers when handler returns POJO', async () => {
        const app = new Shokupan({
            defaultSecurityHeaders: { contentSecurityPolicy: true }
        });

        app.get('/json', (ctx) => {
            return { message: 'hello' };
        });

        const res = await app.testRequest({ path: '/json' });
        // The middleware sets headers on ctx.response, which should be merged into final response
        expect(res.headers['content-security-policy']).toBeDefined();
        expect(res.headers['content-security-policy']).toContain("default-src 'self'");
        await app.stop();
    });

    it('SHK-002: Should mask error details in production', async () => {
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

    it('SHK-003: Should reject multipart request without Content-Length', async () => {
        const app = new Shokupan();
        app.post('/upload', async (ctx) => {
            const body = await ctx.body();
            return { success: true };
        });

        // Request with multipart content-type but NO content-length
        const res = await app.testRequest({
            method: 'POST',
            path: '/upload',
            headers: {
                'content-type': 'multipart/form-data; boundary=---boundary'
            },
            body: '---boundary\r\nContent-Disposition: form-data; name="file"\r\n\r\ntest\r\n---boundary--'
        });

        // Should return 411 Length Required
        expect(res.status).toBe(411);
        await app.stop();
    });

    it('SHK-003: Should accept multipart request with valid Content-Length', async () => {
        const app = new Shokupan({ development: true });
        app.post('/upload', async (ctx) => {
            const body = await ctx.body(); // Trigger parsing
            return { success: true };
        });

        const body = '--boundary\r\nContent-Disposition: form-data; name="field"\r\n\r\nvalue\r\n--boundary--';

        const res = await app.testRequest({
            method: 'POST',
            path: '/upload',
            headers: {
                'content-type': 'multipart/form-data; boundary=boundary',
                'content-length': body.length.toString()
            },
            body: body
        });

        // Since testRequest mocks Request/Response, verify status isn't 411 or 413
        if (res.status === 500) {
            console.log("Error Body:", res.data);
        }
        expect(res.status).toBe(200);
        await app.stop();
    });

});
