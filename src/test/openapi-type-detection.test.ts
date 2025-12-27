import { describe, expect, test } from 'bun:test';
import { Shokupan } from '../shokupan';

describe('OpenAPI Type Detection', () => {
    test('should detect integer type from parseInt', () => {
        const app = new Shokupan();

        app.get('/items', (ctx) => {
            const page = parseInt(ctx.query.page);
            const limit = parseInt(ctx.query.limit);
            return { page, limit };
        });

        const spec = app.generateApiSpec();
        const params = spec.paths['/items'].get.parameters;

        const pageParam = params.find((p: any) => p.name === 'page');
        expect(pageParam).toBeDefined();
        expect(pageParam.schema.type).toBe('integer');
        expect(pageParam.schema.format).toBe('int32');

        const limitParam = params.find((p: any) => p.name === 'limit');
        expect(limitParam).toBeDefined();
        expect(limitParam.schema.type).toBe('integer');
    });

    test('should detect float type from parseFloat', () => {
        const app = new Shokupan();

        app.get('/calculate', (ctx) => {
            const price = parseFloat(ctx.query.price);
            const tax = parseFloat(ctx.query.tax);
            return { total: price + tax };
        });

        const spec = app.generateApiSpec();
        const params = spec.paths['/calculate'].get.parameters;

        const priceParam = params.find((p: any) => p.name === 'price');
        expect(priceParam).toBeDefined();
        expect(priceParam.schema.type).toBe('number');
        expect(priceParam.schema.format).toBe('float');
    });

    test('should detect number type from Number()', () => {
        const app = new Shokupan();

        app.get('/math', (ctx) => {
            const value = Number(ctx.query.value);
            return { result: value * 2 };
        });

        const spec = app.generateApiSpec();
        const params = spec.paths['/math'].get.parameters;

        const valueParam = params.find((p: any) => p.name === 'value');
        expect(valueParam).toBeDefined();
        expect(valueParam.schema.type).toBe('number');
    });

    test('should detect boolean type from Boolean()', () => {
        const app = new Shokupan();

        app.get('/filter', (ctx) => {
            const active = Boolean(ctx.query.active);
            return { active };
        });

        const spec = app.generateApiSpec();
        const params = spec.paths['/filter'].get.parameters;

        const activeParam = params.find((p: any) => p.name === 'active');
        expect(activeParam).toBeDefined();
        expect(activeParam.schema.type).toBe('boolean');
    });

    test('should detect boolean type from double negation', () => {
        const app = new Shokupan();

        app.get('/check', (ctx) => {
            const enabled = !!ctx.query.enabled;
            return { enabled };
        });

        const spec = app.generateApiSpec();
        const params = spec.paths['/check'].get.parameters;

        const enabledParam = params.find((p: any) => p.name === 'enabled');
        expect(enabledParam).toBeDefined();
        expect(enabledParam.schema.type).toBe('boolean');
    });

    test('should default to string for untyped query params', () => {
        const app = new Shokupan();

        app.get('/search', (ctx) => {
            const query = ctx.query.q;
            return { query };
        });

        const spec = app.generateApiSpec();
        const params = spec.paths['/search'].get.parameters;

        const qParam = params.find((p: any) => p.name === 'q');
        expect(qParam).toBeDefined();
        expect(qParam.schema.type).toBe('string');
    });

    test('should detect path parameter types from parseInt', () => {
        const app = new Shokupan();

        app.get('/users/:id', (ctx) => {
            const id = parseInt(ctx.params.id);
            return { user: { id } };
        });

        const spec = app.generateApiSpec();
        const params = spec.paths['/users/{id}'].get.parameters;

        const idParam = params.find((p: any) => p.name === 'id');
        expect(idParam).toBeDefined();
        expect(idParam.schema.type).toBe('integer');
        expect(idParam.in).toBe('path');
    });

    test('should handle mixed typed and untyped parameters', () => {
        const app = new Shokupan();

        app.get('/products', (ctx) => {
            const category = ctx.query.category; // string
            const minPrice = parseFloat(ctx.query.minPrice); // number
            const inStock = Boolean(ctx.query.inStock); // boolean
            const limit = parseInt(ctx.query.limit); // integer
            return { category, minPrice, inStock, limit };
        });

        const spec = app.generateApiSpec();
        const params = spec.paths['/products'].get.parameters;

        expect(params.find((p: any) => p.name === 'category')?.schema.type).toBe('string');
        expect(params.find((p: any) => p.name === 'minPrice')?.schema.type).toBe('number');
        expect(params.find((p: any) => p.name === 'inStock')?.schema.type).toBe('boolean');
        expect(params.find((p: any) => p.name === 'limit')?.schema.type).toBe('integer');
    });

    test('should prioritize type conversions over default string type', () => {
        const app = new Shokupan();

        app.get('/test', (ctx) => {
            // First access as string, then convert to int
            const rawPage = ctx.query.page;
            const page = parseInt(ctx.query.page);
            return { rawPage, page };
        });

        const spec = app.generateApiSpec();
        const params = spec.paths['/test'].get.parameters;

        // Should detect as integer, not string
        const pageParam = params.find((p: any) => p.name === 'page');
        expect(pageParam.schema.type).toBe('integer');
    });
});
