import { describe, expect, test } from 'bun:test';
import { ShokupanRouter } from '../router';
import { Shokupan } from '../shokupan';

describe('OpenAPI Runtime Analysis', () => {
    test('should infer request body from ctx.body usage', () => {
        const app = new Shokupan();

        app.post('/users', async (ctx) => {
            const body = await ctx.body();
            return { created: true, data: body };
        });

        const spec = app.generateApiSpec();

        expect(spec.paths['/users']).toBeDefined();
        expect(spec.paths['/users'].post).toBeDefined();
        expect(spec.paths['/users'].post.requestBody).toBeDefined();
    });

    test('should infer query parameters from ctx.query usage', () => {
        const app = new Shokupan();

        app.get('/search', (ctx) => {
            const query = ctx.query.q;
            return { results: [], query };
        });

        const spec = app.generateApiSpec();

        expect(spec.paths['/search']).toBeDefined();
        expect(spec.paths['/search'].get).toBeDefined();
        expect(spec.paths['/search'].get.parameters).toBeDefined();

        const params = spec.paths['/search'].get.parameters;
        const queryParam = params.find((p: any) => p.name === 'q');
        expect(queryParam).toBeDefined();
        expect(queryParam.in).toBe('query');
    });

    test('should infer JSON response from ctx.json usage', () => {
        const app = new Shokupan();

        app.get('/api/data', (ctx) => {
            return ctx.json({ data: 'test' });
        });

        const spec = app.generateApiSpec();

        expect(spec.paths['/api/data']).toBeDefined();
        expect(spec.paths['/api/data'].get.responses).toBeDefined();
        expect(spec.paths['/api/data'].get.responses['200'].content).toBeDefined();
    });

    test('should combine runtime analysis with decorator specs', () => {
        const app = new Shokupan();

        // Handler uses ctx.query.search
        app.get('/items',
            {
                summary: 'Get items',
                description: 'Retrieves a list of items'
            },
            (ctx) => {
                const search = ctx.query.search;
                return { items: [], search };
            }
        );

        const spec = app.generateApiSpec();

        const operation = spec.paths['/items'].get;

        // Should have decorator spec
        expect(operation.summary).toBe('Get items');
        expect(operation.description).toBe('Retrieves a list of items');

        // Should also have inferred query parameter
        expect(operation.parameters).toBeDefined();
        const searchParam = operation.parameters.find((p: any) => p.name === 'search');
        expect(searchParam).toBeDefined();
    });

    test('should work with mounted routers', () => {
        const app = new Shokupan();
        const apiRouter = new ShokupanRouter();

        apiRouter.get('/users', (ctx) => {
            const role = ctx.query.role;
            return { users: [], role };
        });

        app.mount('/api', apiRouter);

        const spec = app.generateApiSpec();

        expect(spec.paths['/api/users']).toBeDefined();
        expect(spec.paths['/api/users'].get).toBeDefined();
    });

    test('should handle header detection', () => {
        const app = new Shokupan();

        app.get('/protected', (ctx) => {
            const auth = ctx.get('Authorization');
            return { authenticated: !!auth };
        });

        const spec = app.generateApiSpec();

        expect(spec.paths['/protected']).toBeDefined();
        const params = spec.paths['/protected'].get.parameters;
        const authParam = params?.find((p: any) => p.name === 'Authorization');
        expect(authParam).toBeDefined();
        expect(authParam.in).toBe('header');
    });
});
