import { describe, expect, it } from 'bun:test';
import { ShokupanContext } from '../context';
import { ShokupanRouter } from '../router';

describe('Router Middleware Execution', () => {
    it('should execute router middleware when route is matched via find()', async () => {
        const router = new ShokupanRouter();
        const executionOrder: string[] = [];

        // Add middleware to router
        router.use(async (ctx, next) => {
            executionOrder.push('middleware-1');
            await next();
            executionOrder.push('middleware-1-after');
        });

        router.use(async (ctx, next) => {
            executionOrder.push('middleware-2');
            await next();
            executionOrder.push('middleware-2-after');
        });

        // Add route
        router.get('/test', async (ctx) => {
            executionOrder.push('handler');
            return ctx.json({ success: true });
        });

        // Find the route and execute handler
        const match = router.find('GET', '/test');
        expect(match).not.toBeNull();

        if (match) {
            const mockReq = new Request('http://localhost/test');
            const ctx = new ShokupanContext(mockReq as any);

            await match.handler(ctx);

            // Verify middleware executed in correct order
            expect(executionOrder).toEqual([
                'middleware-1',
                'middleware-2',
                'handler',
                'middleware-2-after',
                'middleware-1-after'
            ]);
        }
    });

    it('should execute middleware for nested routers', async () => {
        const parentRouter = new ShokupanRouter();
        const childRouter = new ShokupanRouter();
        const executionOrder: string[] = [];

        // Parent middleware
        parentRouter.use(async (ctx, next) => {
            executionOrder.push('parent-middleware');
            await next();
        });

        // Child middleware
        childRouter.use(async (ctx, next) => {
            executionOrder.push('child-middleware');
            await next();
        });

        // Child route
        childRouter.get('/route', async (ctx) => {
            executionOrder.push('child-handler');
            return ctx.json({ success: true });
        });

        // Mount child router
        parentRouter.mount('/api', childRouter);

        // Find route through parent
        const match = parentRouter.find('GET', '/api/route');
        expect(match).not.toBeNull();

        if (match) {
            const mockReq = new Request('http://localhost/api/route');
            const ctx = new ShokupanContext(mockReq as any);

            await match.handler(ctx);

            // Child middleware should execute, parent middleware is handled at app level
            expect(executionOrder).toContain('child-middleware');
            expect(executionOrder).toContain('child-handler');
        }
    });

    it('should cache wrapped handlers for performance', () => {
        const router = new ShokupanRouter();

        router.use(async (ctx, next) => {
            await next();
        });

        router.get('/test', async (ctx) => {
            return ctx.json({ success: true });
        });

        // Find same route twice
        const match1 = router.find('GET', '/test');
        const match2 = router.find('GET', '/test');

        expect(match1).not.toBeNull();
        expect(match2).not.toBeNull();

        // Wrapped handlers should be the same instance (cached)
        expect(match1!.handler).toBe(match2!.handler);
    });

    it('should not wrap handlers when router has no middleware', () => {
        const router = new ShokupanRouter();

        router.get('/test', async (ctx) => {
            return ctx.json({ success: true });
        });

        const match = router.find('GET', '/test');
        expect(match).not.toBeNull();

        // Handler should be returned as-is when no middleware
        const originalHandler = (router as any).trie.search('GET', '/test').handler;
        expect(match!.handler).toBe(originalHandler);
    });
});
