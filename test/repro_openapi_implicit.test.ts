import { describe, expect, test } from 'bun:test';
import { implicitApp } from './fixtures/ast_implicit_app';

describe('OpenAPI Implicit Return Inference', () => {

    test('should infer detailed schema from implicit ctx.json() call', async () => {
        const spec = await implicitApp.generateApiSpec();
        const response = spec.paths['/implicit-schema'].get.responses['200'];

        expect(response).toBeDefined();

        // Detailed schema check
        const schema = response.content['application/json'].schema;
        expect(schema.type).toBe('object');
        expect(schema.properties).toBeDefined();
        expect(schema.properties.name).toBeDefined();
        expect(schema.properties.name.type).toBe('string');
        expect(schema.properties.id).toBeDefined();
        expect(schema.properties.id.type).toBe('number');
    });

    test('should infer schema from implicit ctx.text() call', async () => {
        const spec = await implicitApp.generateApiSpec();
        const response = spec.paths['/implicit-text'].get.responses['200'];

        expect(response).toBeDefined();
        expect(response.content['text/plain'].schema.type).toBe('string');
    });
});
