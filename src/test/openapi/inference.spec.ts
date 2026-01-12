import { describe, expect, test } from 'bun:test';
import { getSharedSpec } from './test-setup';

describe('OpenAPI Runtime Analysis & Inference', () => {

    describe('Parameter Detection', () => {
        test('should infer request body from ctx.body usage', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/params/users';

            expect(spec.paths[path]).toBeDefined();
            expect(spec.paths[path].post).toBeDefined();
            expect(spec.paths[path].post.requestBody).toBeDefined();
        });

        test('should infer query parameters from ctx.query usage', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/params/search';

            expect(spec.paths[path]).toBeDefined();
            expect(spec.paths[path].get).toBeDefined();
            expect(spec.paths[path].get.parameters).toBeDefined();

            const params = spec.paths[path].get.parameters;
            const queryParam = params.find((p: any) => p.name === 'q');
            expect(queryParam).toBeDefined();
            expect(queryParam.in).toBe('query');
        });

        test('should handle header detection', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/params/protected';

            expect(spec.paths[path]).toBeDefined();
            const params = spec.paths[path].get.parameters;
            const authParam = params?.find((p: any) => p.name === 'Authorization');
            expect(authParam).toBeDefined();
            expect(authParam.in).toBe('header');
        });
    });

    describe('Response Detection', () => {
        test('should infer JSON response from ctx.json usage', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/response/json';

            expect(spec.paths[path]).toBeDefined();
            expect(spec.paths[path].get.responses).toBeDefined();
            expect(spec.paths[path].get.responses['200'].content).toBeDefined();
        });

        test('should detect HTML response from ctx.html()', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/response/html';
            const response = spec.paths[path].get.responses['200'];

            expect(response).toBeDefined();
            expect(response.content['text/html']).toBeDefined();
            expect(response.content['text/html'].schema.type).toBe('string');
        });

        test('should detect text response from ctx.text()', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/response/text';
            const response = spec.paths[path].get.responses['200'];

            expect(response).toBeDefined();
            expect(response.content['text/plain']).toBeDefined();
            expect(response.content['text/plain'].schema.type).toBe('string');
        });

        test('should detect HTML response from ctx.jsx()', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/response/jsx';
            const response = spec.paths[path].get.responses['200'];

            expect(response).toBeDefined();
            expect(response.content['text/html']).toBeDefined();
            expect(response.content['text/html'].schema.type).toBe('string');
        });

        test('should detect file response from ctx.file()', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/response/file';
            const response = spec.paths[path].get.responses['200'];

            expect(response).toBeDefined();
            expect(response.content['application/octet-stream']).toBeDefined();
            expect(response.content['application/octet-stream'].schema.format).toBe('binary');
        });

        test('should detect redirect from ctx.redirect()', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/response/redirect';

            expect(spec.paths[path].get.responses['302']).toBeDefined();
            expect(spec.paths[path].get.responses['302'].description).toBe('Redirect');
        });

        test('should detect specific redirect status from ctx.redirect(url, status)', async () => {
            const spec = await getSharedSpec();

            const movedPath = '/inference/response/redirect-301';
            expect(spec.paths[movedPath].get.responses['301']).toBeDefined();
            expect(spec.paths[movedPath].get.responses['301'].description).toBe('Redirect (301)');

            const tempPath = '/inference/response/redirect-307';
            expect(spec.paths[tempPath].get.responses['307']).toBeDefined();
            expect(spec.paths[tempPath].get.responses['307'].description).toBe('Redirect (307)');
        });

        test('should detect error responses with status codes', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/response/error';
            const responses = spec.paths[path].post.responses;

            expect(responses['200']).toBeDefined();
            expect(responses['400']).toBeDefined();
            expect(responses['400'].description).toContain('400');
        });
    });

    describe('Type Detection', () => {
        test('should detect integer type from parseInt', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/types/items';
            const params = spec.paths[path].get.parameters;

            const pageParam = params.find((p: any) => p.name === 'page');
            expect(pageParam).toBeDefined();
            expect(pageParam.schema.type).toBe('integer');
            expect(pageParam.schema.format).toBe('int32');

            const limitParam = params.find((p: any) => p.name === 'limit');
            expect(limitParam).toBeDefined();
            expect(limitParam.schema.type).toBe('integer');
        });

        test('should detect float type from parseFloat', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/types/calculate';
            const params = spec.paths[path].get.parameters;

            const priceParam = params.find((p: any) => p.name === 'price');
            expect(priceParam).toBeDefined();
            expect(priceParam.schema.type).toBe('number');
            expect(priceParam.schema.format).toBe('float');
        });

        test('should detect number type from Number()', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/types/math';
            const params = spec.paths[path].get.parameters;

            const valueParam = params.find((p: any) => p.name === 'value');
            expect(valueParam).toBeDefined();
            expect(valueParam.schema.type).toBe('number');
        });

        test('should detect boolean type from Boolean()', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/types/filter';
            const params = spec.paths[path].get.parameters;

            const activeParam = params.find((p: any) => p.name === 'active');
            expect(activeParam).toBeDefined();
            expect(activeParam.schema.type).toBe('boolean');
        });

        test('should detect boolean type from double negation', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/types/check';
            const params = spec.paths[path].get.parameters;

            const enabledParam = params.find((p: any) => p.name === 'enabled');
            expect(enabledParam).toBeDefined();
            expect(enabledParam.schema.type).toBe('boolean');
        });

        test('should default to string for untyped query params', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/types/search-default';
            const params = spec.paths[path].get.parameters;

            const qParam = params.find((p: any) => p.name === 'q');
            expect(qParam).toBeDefined();
            expect(qParam.schema.type).toBe('string');
        });

        test('should detect path parameter types from parseInt', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/types/users/{id}';
            const params = spec.paths[path].get.parameters;

            const idParam = params.find((p: any) => p.name === 'id');
            expect(idParam).toBeDefined();
            expect(idParam.schema.type).toBe('integer');
            expect(idParam.in).toBe('path');
        });

        test('should handle mixed typed and untyped parameters', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/types/products';
            const params = spec.paths[path].get.parameters;

            expect(params.find((p: any) => p.name === 'category')?.schema.type).toBe('string');
            expect(params.find((p: any) => p.name === 'minPrice')?.schema.type).toBe('number');
            expect(params.find((p: any) => p.name === 'inStock')?.schema.type).toBe('boolean');
            expect(params.find((p: any) => p.name === 'limit')?.schema.type).toBe('integer');
        });

        test('should prioritize type conversions over default string type', async () => {
            const spec = await getSharedSpec();
            const path = '/inference/types/mixed';
            const params = spec.paths[path].get.parameters;

            // Should detect as integer, not string
            const pageParam = params.find((p: any) => p.name === 'page');
            expect(pageParam.schema.type).toBe('integer');
        });
    });

    test('should combine runtime analysis with decorator specs', async () => {
        const spec = await getSharedSpec();
        const path = '/inference/decorators/items';

        const operation = spec.paths[path].get;

        // Should have decorator spec
        expect(operation.summary).toBe('Get items');
        expect(operation.description).toBe('Retrieves a list of items');

        // Should also have inferred query parameter
        expect(operation.parameters).toBeDefined();
        const searchParam = operation.parameters.find((p: any) => p.name === 'search');
        expect(searchParam).toBeDefined();
    });

    test('should work with mounted routers', async () => {
        const spec = await getSharedSpec();
        const path = '/inference/mount/api/users';

        expect(spec.paths[path]).toBeDefined();
        expect(spec.paths[path].get).toBeDefined();
    });
});
