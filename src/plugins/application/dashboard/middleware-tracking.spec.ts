import { afterAll, describe, expect, it } from 'bun:test';
import tap from 'supertest';
import { Shokupan } from '../../../shokupan';
import { Dashboard } from './plugin';

describe('Dashboard - Middleware Mutation Tracking', () => {
    afterAll(() => {
        const { FetchInterceptor } = require('./fetch-interceptor');
        FetchInterceptor.restore();
    });

    it('should track middleware state mutations', async () => {
        const app = new Shokupan({ port: 0 });
        // Dashboard will auto-enable middleware tracking
        app.register(new Dashboard({ trackStateMutations: true }));

        // Add middleware that mutates state
        app.use((ctx, next) => {
            ctx.state.userId = 'user-123';
            ctx.state.isAuthenticated = true;
            return next();
        });

        app.use((ctx, next) => {
            ctx.state.requestId = 'req-abc';
            ctx.state.timestamp = Date.now();
            return next();
        });

        app.get('/test', (ctx) => {
            ctx.state.handlerCalled = true;
            return ctx.json({ ok: true });
        });

        const server = await app.listen();
        const request = tap(server.url.toString());

        await request.get('/test').expect(200);

        // Give time for async database operations
        await new Promise(resolve => setTimeout(resolve, 100));

        // Fetch requests from dashboard endpoint
        const res = await request.get('/dashboard/requests').expect(200);
        const data = res.body;

        expect(Array.isArray(data.requests)).toBe(true);
        expect(data.requests.length).toBeGreaterThan(0);

        const testRequest = data.requests.find((r: any) => new URL(r.url).pathname === '/test');
        expect(testRequest).toBeDefined();
        expect(testRequest.handlerStack).toBeDefined();
        expect(Array.isArray(testRequest.handlerStack)).toBe(true);

        // Verify state changes are tracked
        const middlewareWithChanges = testRequest.handlerStack.filter(
            (h: any) => h.stateChanges && Object.keys(h.stateChanges).length > 0
        );

        expect(middlewareWithChanges.length).toBeGreaterThan(0);

        // Verify specific mutations
        const firstMiddleware = testRequest.handlerStack.find((h: any) => h.stateChanges?.userId);
        expect(firstMiddleware).toBeDefined();
        expect(firstMiddleware.stateChanges.userId).toBe('user-123');
        expect(firstMiddleware.stateChanges.isAuthenticated).toBe(true);

        const secondMiddleware = testRequest.handlerStack.find((h: any) => h.stateChanges?.requestId);
        expect(secondMiddleware).toBeDefined();
        expect(secondMiddleware.stateChanges.requestId).toBe('req-abc');

        server.stop();
    });

    it('should always track when Dashboard is enabled', async () => {
        const app = new Shokupan({ port: 0 });
        // Dashboard plugin automatically enables middleware tracking

        app.register(new Dashboard());

        app.use((ctx, next) => {
            ctx.state.alwaysTracked = true;
            return next();
        });

        app.get('/test', (ctx) => {
            return ctx.json({ ok: true });
        });

        const server = await app.listen();
        const request = tap(server.url.toString());

        await request.get('/test').expect(200);

        await new Promise(resolve => setTimeout(resolve, 100));

        const res = await request.get('/dashboard/requests').expect(200);
        const data = res.body;

        const testRequest = data.requests.find((r: any) => new URL(r.url).pathname === '/test');

        // Dashboard always enables tracking, so we should have state changes
        expect(testRequest).toBeDefined();
        if (testRequest && testRequest.handlerStack) {
            const hasStateChanges = testRequest.handlerStack.some(
                (h: any) => h.stateChanges && Object.keys(h.stateChanges).length > 0
            );
            expect(hasStateChanges).toBe(true);
        }

        server.stop();
    });
});
