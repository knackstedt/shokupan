import { describe, expect, test } from 'bun:test';
import { getSharedSpec } from './test-setup';

describe('OpenAPI Built-in Type Analysis', () => {
    test('should resolve performance object type', async () => {
        const spec = await getSharedSpec();
        const path = '/large-json';

        expect(spec.paths[path]).toBeDefined();
        expect(spec.paths[path].get).toBeDefined();

        const response = spec.paths[path].get.responses['200'];
        expect(response).toBeDefined();
        expect(response.content['application/json']).toBeDefined();

        const schema = response.content['application/json'].schema;
        expect(schema).toBeDefined();
        expect(schema.type).toBe('object');

        // Performance object should have properties
        expect(schema.properties).toBeDefined();
        expect(Object.keys(schema.properties).length).toBeGreaterThan(0);

        // Should not have x-unknown marker
        expect(schema['x-unknown']).toBeUndefined();
    });

    test('should resolve process.env object type', async () => {
        const spec = await getSharedSpec();
        const path = '/large-json2';

        expect(spec.paths[path]).toBeDefined();
        expect(spec.paths[path].get).toBeDefined();

        const response = spec.paths[path].get.responses['200'];
        expect(response).toBeDefined();
        expect(response.content['application/json']).toBeDefined();

        const schema = response.content['application/json'].schema;
        expect(schema).toBeDefined();
        expect(schema.type).toBe('object');

        // process.env should be recognized as object type
        // It may not have specific properties since process.env is dynamic
        // but it should at least be recognized as an object, not unknown
        expect(schema['x-unknown']).toBeUndefined();
    });

    test.skip('should handle nested property access (process.env)', async () => {
        const spec = await getSharedSpec();
        const path = '/json3';

        expect(spec.paths[path]).toBeDefined();
        const response = spec.paths[path].get.responses['200'];

        const schema = response.content['application/json'].schema;
        expect(schema).toBeDefined();
        expect(schema.type).toBe('object');
        expect(schema.properties).toBeDefined();
        expect(schema.properties.message).toBeDefined();
        // The || operator creates a union/oneOf, but should still have type info
        const messageType = schema.properties.message;
        // Should be string type or oneOf with string, not x-unknown
        if (messageType.oneOf) {
            // If it's a oneOf, all options should be string
            expect(messageType.oneOf.every((s: any) => s.type === 'string')).toBe(true);
        } else {
            expect(messageType.type).toBe('string');
        }
    });

    test('should resolve built-in types in variable assignments', async () => {
        const spec = await getSharedSpec();
        // /json4 uses process.env['FOO'] || 'bar' pattern
        const path = '/json4';

        expect(spec.paths[path]).toBeDefined();
        const response = spec.paths[path].get.responses['200'];

        const schema = response.content['application/json'].schema;
        expect(schema).toBeDefined();
        expect(schema.properties.message).toBeDefined();
        // The || operator creates a union/oneOf, but should still have type info
        const messageType = schema.properties.message;
        // Should be string type or oneOf with string, not x-unknown
        if (messageType.oneOf) {
            // If it's a oneOf, all options should be string
            expect(messageType.oneOf.every((s: any) => s.type === 'string')).toBe(true);
        } else {
            expect(messageType.type).toBe('string');
        }
    });

    test('should not mark built-in types as unknown', async () => {
        const spec = await getSharedSpec();

        const checkNoUnknown = (schema: any): boolean => {
            if (!schema) return true;
            if (schema['x-unknown']) return false;

            if (schema.properties) {
                for (const prop of Object.values(schema.properties)) {
                    if (!checkNoUnknown(prop)) return false;
                }
            }

            if (schema.items) {
                if (!checkNoUnknown(schema.items)) return false;
            }

            if (schema.oneOf) {
                for (const subSchema of schema.oneOf) {
                    if (!checkNoUnknown(subSchema)) return false;
                }
            }

            return true;
        };

        // Check that built-in type responses don't have x-unknown
        const largeJsonResponse = spec.paths['/large-json'].get.responses['200'];
        const largeJsonSchema = largeJsonResponse.content['application/json'].schema;
        expect(checkNoUnknown(largeJsonSchema)).toBe(true);

        const largeJson2Response = spec.paths['/large-json2'].get.responses['200'];
        const largeJson2Schema = largeJson2Response.content['application/json'].schema;
        expect(checkNoUnknown(largeJson2Schema)).toBe(true);
    });
});
