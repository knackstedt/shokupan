import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { OpenAPIAnalyzer } from '../../plugins/application/openapi/analyzer';

async function getSpec(directory: string) {
    const analyzer = new OpenAPIAnalyzer(directory);
    await analyzer.analyze();
    return analyzer.generateOpenAPISpec();
}

describe('OpenAPI Analyzer', () => {
    test('should analyze example directory and generate OpenAPI spec', async () => {
        const exampleDir = path.join(__dirname, '../../example');

        const spec = await getSpec(exampleDir);

        // Verify basic structure
        expect(spec).toBeDefined();
        expect(spec.openapi).toBe('3.1.0');
        expect(spec.info).toBeDefined();
        expect(spec.info.title).toBe('Shokupan API');
        expect(spec.paths).toBeDefined();

        // Verify paths were found
        const pathCount = Object.keys(spec.paths).length;
        expect(pathCount).toBeGreaterThan(0);

        console.log(`✓ Found ${pathCount} unique paths`);
    });

    test('should extract route methods correctly', async () => {
        const exampleDir = path.join(__dirname, '../../example');

        const spec = await getSpec(exampleDir);

        // Check that at least one path has a GET method
        const hasGetMethod = Object.values(spec.paths).some((pathItem: any) =>
            pathItem.get !== undefined
        );

        expect(hasGetMethod).toBe(true);
    });

    test('should handle non-existent directory gracefully', async () => {
        const nonExistentDir = '/path/that/does/not/exist';

        // Should not throw, but return empty spec (or empty paths)
        const spec = await getSpec(nonExistentDir);
        expect(spec).toBeDefined();
    });

    test('generated spec should be valid JSON', async () => {
        const exampleDir = path.join(__dirname, '../../example');

        const spec = await getSpec(exampleDir);

        // Should be serializable to JSON
        const json = JSON.stringify(spec);
        expect(json).toBeDefined();

        // Should be parseable
        const parsed = JSON.parse(json);
        expect(parsed.openapi).toBe('3.1.0');
    });

    describe('Response Schema Inference', () => {
        const fixtureDir = path.join(__dirname, 'fixtures/analyzer-response');

        test('should infer response schema referencing request body variable', async () => {
            const spec = await getSpec(fixtureDir);

            // Expected path: /var-reuse (from demo.ts)
            // But fixture dir might contain multiple files. 
            // demo.ts has /var-reuse
            const op = spec.paths['/var-reuse']?.post;
            expect(op).toBeDefined();

            const schema = op.responses['200'].content['application/json'].schema;
            expect(schema).toBeDefined();
            expect(schema.type).toBe('object');
            expect(schema.properties.data).toBeDefined();
        });

        test('should infer schema from direct object literal', async () => {
            const spec = await getSpec(fixtureDir);

            const op = spec.paths['/literal']?.get;
            expect(op).toBeDefined();

            const schema = op.responses['200'].content['application/json'].schema;
            expect(schema.properties.message).toBeDefined();
            expect(schema.properties.tags.type).toBe('array');
        });

        test('should handle nested variable references', async () => {
            const spec = await getSpec(fixtureDir);

            const op = spec.paths['/nested-reuse']?.post;
            expect(op).toBeDefined();

            const schema = op.responses['200'].content['application/json'].schema;
            expect(schema.properties.payload).toBeDefined();
            expect(schema.properties.payload.properties.user).toBeDefined();
        });
    });

    describe('Type Assertions', () => {
        const fixtureDir = path.join(__dirname, 'fixtures/analyzer-types');

        test('should extract schema from simple object type assertion', async () => {
            const spec = await getSpec(fixtureDir);
            const op = spec.paths['/users']?.post;

            // Wait, this test checks request body inference from type assertion?
            // "should extract schema from simple object type assertion"
            // The fixture: const body = await ctx.body() as { name: string; age: number; };
            // So requestBody should have schema.

            expect(op.requestBody).toBeDefined();
            const schema = op.requestBody.content['application/json'].schema;
            expect(schema.properties.name.type).toBe('string');
            expect(schema.properties.age.type).toBe('number');
        });

        test('should extract schema from nested object type assertion', async () => {
            const spec = await getSpec(fixtureDir);
            const op = spec.paths['/products']?.post;

            expect(op.requestBody).toBeDefined();
            const schema = op.requestBody.content['application/json'].schema;
            expect(schema.properties.details.type).toBe('object');
            expect(schema.properties.details.properties.price.type).toBe('number');
        });

        test('should extract schema from array type assertion', async () => {
            const spec = await getSpec(fixtureDir);
            const op = spec.paths['/batch']?.post;

            const schema = op.requestBody.content['application/json'].schema;
            expect(schema.properties.items.type).toBe('array');
            expect(schema.properties.items.items.type).toBe('string');
        });

        test('should default to generic object when no type assertion is present', async () => {
            const spec = await getSpec(fixtureDir);
            const op = spec.paths['/generic']?.post;

            const schema = op.requestBody.content['application/json'].schema;
            expect(schema.type).toBe('object');
        });
    });
});
