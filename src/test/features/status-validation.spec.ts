
import { describe, expect, test } from "bun:test";
import { ShokupanRouter } from "../../router";
import { Shokupan } from "../../shokupan";

describe('Status Code Validation', () => {
    test('should validate status code at App level', async () => {
        const app = new Shokupan({
            validateStatus: true
        });

        app.get('/valid', (ctx) => {
            return ctx.status(200);
        });

        app.get('/invalid', (ctx) => {
            return ctx.status(999);
        });

        app.get('/redirect-valid', (ctx) => {
            return ctx.redirect('/', 302);
        });

        app.get('/redirect-invalid', (ctx) => {
            return ctx.redirect('/', 305); // 305 is Use Proxy (deprecated) and we don't allow it
        });

        // 305 is in VALID_HTTP_STATUSES but VALID_REDIRECT_STATUSES is specific: 301, 302, 303, 307, 308.

        let res = await app.testRequest({ url: 'http://localhost/valid' });
        expect(res.status).toBe(200);

        let invalidRes = await app.testRequest({ url: 'http://localhost/invalid' });
        expect(invalidRes.status).toBe(500);
        const body = await invalidRes.data;
        expect(body.error).toContain("Invalid HTTP status code: 999");
    });

    test('should validate status code at Router level', async () => {
        const app = new Shokupan();
        const router = new ShokupanRouter({
            validateStatus: true
        });

        router.get('/router-valid', (ctx) => {
            return ctx.status(201);
        });

        router.get('/router-invalid', (ctx) => {
            return ctx.status(888);
        });

        app.mount('/api', router);

        let res = await app.testRequest({ url: 'http://localhost/api/router-valid' });
        expect(res.status).toBe(201);

        let invalidRes = await app.testRequest({ url: 'http://localhost/api/router-invalid' });
        expect(invalidRes.status).toBe(500);
        const body = await invalidRes.data;
        expect(body.error).toContain("Invalid HTTP status code: 888");
    });

    test('should NOT validate by default', async () => {
        const app = new Shokupan();

        app.get('/weird', (ctx) => {
            return ctx.status(999);
        });

        // Bun/Node Response constructor throws RangeError for 999. Validating that our code doesn't intercept it first.
        let res = await app.testRequest({ url: 'http://localhost/weird' });
        expect(res.status).toBe(500);
        const body = await res.data;
        // The error comes from Bun internals: RangeError
        expect(body.error).toBeDefined();
    });

    test('validates redirect codes specifically', async () => {
        const app = new Shokupan({
            validateStatus: true
        });

        app.get('/bad-redirect', (ctx) => {
            // 200 is a valid HTTP status but INVALID for redirect() method logic key
            return ctx.redirect('/', 200);
        });

        let res = await app.testRequest({ url: 'http://localhost/bad-redirect' });
        expect(res.status).toBe(500);
        const body = await res.data;
        expect(body.error).toContain("Invalid redirect status code: 200");
    });
});
