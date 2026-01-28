import { describe, expect, it } from 'bun:test';
import { Shokupan } from '../../../shokupan';
import { ErrorView } from '../error-view';

describe('Error View Plugin', () => {

    it('should register without errors', async () => {
        const app = new Shokupan();
        const plugin = new ErrorView();
        await plugin.onInit(app);
        expect(app).toBeDefined();
    });

    it('should render HTML error page when Accept header includes text/html', async () => {
        const app = new Shokupan({
            securityHeaders: false
        });

        const plugin = new ErrorView();
        await plugin.onInit(app);

        app.get('/error', (ctx) => {
            throw new Error("Test Error");
        });

        const res = await app.testRequest({
            method: 'GET',
            url: 'http://localhost/error',
            headers: {
                'Accept': 'text/html'
            }
        });

        expect(res.status).toBe(500);
        expect(res.headers['content-type']).toContain('text/html');
        expect(res.data).toContain('<html');
        expect(res.data).toContain('Test Error');
    });

    it('should return JSON error when Accept header does not include text/html', async () => {
        const app = new Shokupan({ securityHeaders: false });
        const plugin = new ErrorView();
        await plugin.onInit(app);

        app.get('/error', () => {
            throw new Error("Test Error");
        });

        const res = await app.testRequest({
            method: 'GET',
            url: 'http://localhost/error',
            headers: {
                'Accept': 'application/json'
            }
        });

        expect(res.status).toBe(500);
        expect(res.headers['content-type']).toContain('application/json');
        expect(res.data).toHaveProperty('error', 'Test Error');
    });

    it('should render status view for manual status codes (e.g. ctx.status(503))', async () => {
        const app = new Shokupan({ securityHeaders: false });
        const plugin = new ErrorView();
        await plugin.onInit(app);

        app.get('/manual-503', (ctx) => {
            return ctx.status(503);
        });

        const res = await app.testRequest({
            method: 'GET',
            url: 'http://localhost/manual-503',
            headers: {
                'Accept': 'text/html'
            }
        });

        expect(res.status).toBe(503);
        expect(res.headers['content-type']).toContain('text/html');
        // Check for generic status page content
        expect(res.data).toContain('<html');
        expect(res.data).toContain('503');
        // Should contain the reason phrase "Service Unavailable" as the message
        expect(res.data).toContain('Service Unavailable');
    });
});
