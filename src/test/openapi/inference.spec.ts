import { describe, expect, test } from 'bun:test';
import { ShokupanRouter } from '../../router';
import { Shokupan } from '../../shokupan';

describe('OpenAPI Runtime Analysis & Inference', () => {

    describe('Parameter Detection', () => {
        test('should infer request body from ctx.body usage', async () => {
            const app = new Shokupan();

            app.post('/users', async (ctx) => {
                const body = await ctx.body();
                return { created: true, data: body };
            });

            const spec = await app.generateApiSpec();

            expect(spec.paths['/users']).toBeDefined();
            expect(spec.paths['/users'].post).toBeDefined();
            expect(spec.paths['/users'].post.requestBody).toBeDefined();
        });

        test('should infer query parameters from ctx.query usage', async () => {
            const app = new Shokupan();

            app.get('/search', (ctx) => {
                const query = ctx.query['q'];
                return { results: [], query };
            });

            const spec = await app.generateApiSpec();

            expect(spec.paths['/search']).toBeDefined();
            expect(spec.paths['/search'].get).toBeDefined();
            expect(spec.paths['/search'].get.parameters).toBeDefined();

            const params = spec.paths['/search'].get.parameters;
            const queryParam = params.find((p: any) => p.name === 'q');
            expect(queryParam).toBeDefined();
            expect(queryParam.in).toBe('query');
        });

        test('should handle header detection', async () => {
            const app = new Shokupan();

            app.get('/protected', (ctx) => {
                const auth = ctx.get('Authorization');
                return { authenticated: !!auth };
            });

            const spec = await app.generateApiSpec();

            expect(spec.paths['/protected']).toBeDefined();
            const params = spec.paths['/protected'].get.parameters;
            const authParam = params?.find((p: any) => p.name === 'Authorization');
            expect(authParam).toBeDefined();
            expect(authParam.in).toBe('header');
        });
    });

    describe('Response Detection', () => {
        test('should infer JSON response from ctx.json usage', async () => {
            const app = new Shokupan();

            app.get('/api/data', (ctx) => {
                return ctx.json({ data: 'test' });
            });

            const spec = await app.generateApiSpec();

            expect(spec.paths['/api/data']).toBeDefined();
            expect(spec.paths['/api/data'].get.responses).toBeDefined();
            expect(spec.paths['/api/data'].get.responses['200'].content).toBeDefined();
        });

        test('should detect HTML response from ctx.html()', async () => {
            const app = new Shokupan();

            app.get('/page', (ctx) => {
                return ctx.html('<html><body>Hello</body></html>');
            });

            const spec = await app.generateApiSpec();
            const response = spec.paths['/page'].get.responses['200'];

            expect(response).toBeDefined();
            expect(response.content['text/html']).toBeDefined();
            expect(response.content['text/html'].schema.type).toBe('string');
        });

        test('should detect text response from ctx.text()', async () => {
            const app = new Shokupan();

            app.get('/message', (ctx) => {
                return ctx.text('Hello, World!');
            });

            const spec = await app.generateApiSpec();
            const response = spec.paths['/message'].get.responses['200'];

            expect(response).toBeDefined();
            expect(response.content['text/plain']).toBeDefined();
            expect(response.content['text/plain'].schema.type).toBe('string');
        });

        test('should detect file response from ctx.file()', async () => {
            const app = new Shokupan();

            app.get('/download', (ctx) => {
                return ctx.file('/path/to/file.pdf');
            });

            const spec = await app.generateApiSpec();
            const response = spec.paths['/download'].get.responses['200'];

            expect(response).toBeDefined();
            expect(response.content['application/octet-stream']).toBeDefined();
            expect(response.content['application/octet-stream'].schema.format).toBe('binary');
        });

        test('should detect redirect from ctx.redirect()', async () => {
            const app = new Shokupan();

            app.get('/old-path', (ctx) => {
                return ctx.redirect('/new-path');
            });

            const spec = await app.generateApiSpec();

            expect(spec.paths['/old-path'].get.responses['302']).toBeDefined();
            expect(spec.paths['/old-path'].get.responses['302'].description).toBe('Redirect');
        });

        test('should detect error responses with status codes', async () => {
            const app = new Shokupan();

            app.post('/validate', (ctx) => {
                if (!ctx.query['value']) {
                    return ctx.json({ error: 'Missing value' }, 400);
                }
                return ctx.json({ success: true });
            });

            const spec = await app.generateApiSpec();
            const responses = spec.paths['/validate'].post.responses;

            expect(responses['200']).toBeDefined();
            expect(responses['400']).toBeDefined();
            expect(responses['400'].description).toContain('400');
        });
    });

    describe('Type Detection', () => {
        test('should detect integer type from parseInt', async () => {
            const app = new Shokupan();

            app.get('/items', (ctx) => {
                const page = parseInt(ctx.query['page']);
                const limit = parseInt(ctx.query['limit']);
                return { page, limit };
            });

            const spec = await app.generateApiSpec();
            const params = spec.paths['/items'].get.parameters;

            const pageParam = params.find((p: any) => p.name === 'page');
            expect(pageParam).toBeDefined();
            expect(pageParam.schema.type).toBe('integer');
            expect(pageParam.schema.format).toBe('int32');

            const limitParam = params.find((p: any) => p.name === 'limit');
            expect(limitParam).toBeDefined();
            expect(limitParam.schema.type).toBe('integer');
        });

        test('should detect float type from parseFloat', async () => {
            const app = new Shokupan();

            app.get('/calculate', (ctx) => {
                const price = parseFloat(ctx.query['price']);
                const tax = parseFloat(ctx.query['tax']);
                return { total: price + tax };
            });

            const spec = await app.generateApiSpec();
            const params = spec.paths['/calculate'].get.parameters;

            const priceParam = params.find((p: any) => p.name === 'price');
            expect(priceParam).toBeDefined();
            expect(priceParam.schema.type).toBe('number');
            expect(priceParam.schema.format).toBe('float');
        });

        test('should detect number type from Number()', async () => {
            const app = new Shokupan();

            app.get('/math', (ctx) => {
                const value = Number(ctx.query['value']);
                return { result: value * 2 };
            });

            const spec = await app.generateApiSpec();
            const params = spec.paths['/math'].get.parameters;

            const valueParam = params.find((p: any) => p.name === 'value');
            expect(valueParam).toBeDefined();
            expect(valueParam.schema.type).toBe('number');
        });

        test('should detect boolean type from Boolean()', async () => {
            const app = new Shokupan();

            app.get('/filter', (ctx) => {
                const active = Boolean(ctx.query['active']);
                return { active };
            });

            const spec = await app.generateApiSpec();
            const params = spec.paths['/filter'].get.parameters;

            const activeParam = params.find((p: any) => p.name === 'active');
            expect(activeParam).toBeDefined();
            expect(activeParam.schema.type).toBe('boolean');
        });

        test('should detect boolean type from double negation', async () => {
            const app = new Shokupan();

            app.get('/check', (ctx) => {
                const enabled = !!ctx.query['enabled'];
                return { enabled };
            });

            const spec = await app.generateApiSpec();
            const params = spec.paths['/check'].get.parameters;

            const enabledParam = params.find((p: any) => p.name === 'enabled');
            expect(enabledParam).toBeDefined();
            expect(enabledParam.schema.type).toBe('boolean');
        });

        test('should default to string for untyped query params', async () => {
            const app = new Shokupan();

            app.get('/search', (ctx) => {
                const query = ctx.query['q'];
                return { query };
            });

            const spec = await app.generateApiSpec();
            const params = spec.paths['/search'].get.parameters;

            const qParam = params.find((p: any) => p.name === 'q');
            expect(qParam).toBeDefined();
            expect(qParam.schema.type).toBe('string');
        });

        test('should detect path parameter types from parseInt', async () => {
            const app = new Shokupan();

            app.get('/users/:id', (ctx) => {
                const id = parseInt(ctx.params['id']);
                return { user: { id } };
            });

            const spec = await app.generateApiSpec();
            const params = spec.paths['/users/{id}'].get.parameters;

            const idParam = params.find((p: any) => p.name === 'id');
            expect(idParam).toBeDefined();
            expect(idParam.schema.type).toBe('integer');
            expect(idParam.in).toBe('path');
        });

        test('should handle mixed typed and untyped parameters', async () => {
            const app = new Shokupan();

            app.get('/products', (ctx) => {
                const category = ctx.query['category']; // string
                const minPrice = parseFloat(ctx.query['minPrice']); // number
                const inStock = Boolean(ctx.query['inStock']); // boolean
                const limit = parseInt(ctx.query['limit']); // integer
                return { category, minPrice, inStock, limit };
            });

            const spec = await app.generateApiSpec();
            const params = spec.paths['/products'].get.parameters;

            expect(params.find((p: any) => p.name === 'category')?.schema.type).toBe('string');
            expect(params.find((p: any) => p.name === 'minPrice')?.schema.type).toBe('number');
            expect(params.find((p: any) => p.name === 'inStock')?.schema.type).toBe('boolean');
            expect(params.find((p: any) => p.name === 'limit')?.schema.type).toBe('integer');
        });

        test('should prioritize type conversions over default string type', async () => {
            const app = new Shokupan();

            app.get('/test', (ctx) => {
                // First access as string, then convert to int
                const rawPage = ctx.query['page'];
                const page = parseInt(ctx.query['page']);
                return { rawPage, page };
            });

            const spec = await app.generateApiSpec();
            const params = spec.paths['/test'].get.parameters;

            // Should detect as integer, not string
            const pageParam = params.find((p: any) => p.name === 'page');
            expect(pageParam.schema.type).toBe('integer');
        });
    });

    test('should combine runtime analysis with decorator specs', async () => {
        const app = new Shokupan();

        // Handler uses ctx.query.search
        app.get('/items',
            {
                summary: 'Get items',
                description: 'Retrieves a list of items'
            },
            (ctx) => {
                const search = ctx.query['search'];
                return { items: [], search };
            }
        );

        const spec = await app.generateApiSpec();

        const operation = spec.paths['/items'].get;

        // Should have decorator spec
        expect(operation.summary).toBe('Get items');
        expect(operation.description).toBe('Retrieves a list of items');

        // Should also have inferred query parameter
        expect(operation.parameters).toBeDefined();
        const searchParam = operation.parameters.find((p: any) => p.name === 'search');
        expect(searchParam).toBeDefined();
    });

    test('should work with mounted routers', async () => {
        const app = new Shokupan();
        const apiRouter = new ShokupanRouter();

        apiRouter.get('/users', (ctx) => {
            const role = ctx.query['role'];
            return { users: [], role };
        });

        app.mount('/api', apiRouter);

        const spec = await app.generateApiSpec();

        expect(spec.paths['/api/users']).toBeDefined();
        expect(spec.paths['/api/users'].get).toBeDefined();
    });
});
