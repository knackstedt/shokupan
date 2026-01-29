import { describe, expect, it } from "bun:test";
import { ResponseTransformerRegistry } from "./response-transformer";

describe("ResponseTransformerRegistry", () => {
    it("should register and retrieve transformers", () => {
        const registry = new ResponseTransformerRegistry();

        registry.register({
            contentType: 'application/json',
            serialize: (data) => ({ body: JSON.stringify(data) })
        });

        const transformer = registry.getTransformer('application/json');
        expect(transformer).toBeDefined();
        expect(transformer?.contentType).toBe('application/json');
    });

    it("should handle array of content types", () => {
        const registry = new ResponseTransformerRegistry();

        registry.register({
            contentType: ['application/xml', 'text/xml'],
            serialize: (data) => ({ body: '<xml></xml>' })
        });

        expect(registry.getTransformer('application/xml')).toBeDefined();
        expect(registry.getTransformer('text/xml')).toBeDefined();
    });

    it("should normalize content types to lowercase", () => {
        const registry = new ResponseTransformerRegistry();

        registry.register({
            contentType: 'AppLication/JSON',
            serialize: (data) => ({ body: '{}' })
        });

        expect(registry.getTransformer('application/json')).toBeDefined();
    });

    describe("negotiate", () => {
        it("should return exact match", () => {
            const registry = new ResponseTransformerRegistry();
            const jsonTransformer = {
                contentType: 'application/json',
                serialize: (data: any) => ({ body: '{}' })
            };
            registry.register(jsonTransformer);

            const match = registry.negotiate('application/json');
            expect(match).toBe(jsonTransformer);
        });

        it("should return undefined if no match and no default", () => {
            const registry = new ResponseTransformerRegistry();
            const match = registry.negotiate('application/json');
            expect(match).toBeUndefined();
        });

        it("should return match based on quality value", () => {
            const registry = new ResponseTransformerRegistry();

            const jsonTransformer = {
                contentType: 'application/json',
                serialize: (data: any) => ({ body: '{}' })
            };
            const xmlTransformer = {
                contentType: 'application/xml',
                serialize: (data: any) => ({ body: '<xml/>' })
            };

            registry.register(jsonTransformer);
            registry.register(xmlTransformer);

            // XML preferred (q=0.9) over JSON (q=0.8)
            const match = registry.negotiate('application/json;q=0.8, application/xml;q=0.9');
            expect(match).toBe(xmlTransformer);

            // JSON preferred
            const match2 = registry.negotiate('application/json;q=1.0, application/xml;q=0.9');
            expect(match2).toBe(jsonTransformer);
        });

        it("should handle wildcard matching", () => {
            const registry = new ResponseTransformerRegistry();
            const jsonTransformer = {
                contentType: 'application/json',
                serialize: (data: any) => ({ body: '{}' })
            };
            registry.register(jsonTransformer);

            // application/* should match application/json
            const match = registry.negotiate('application/*');
            expect(match).toBe(jsonTransformer);
        });

        it("should handle */* by returning default if set", () => {
            const registry = new ResponseTransformerRegistry();
            const jsonTransformer = {
                contentType: 'application/json',
                serialize: (data: any) => ({ body: '{}' })
            };
            registry.register(jsonTransformer);
            registry.setDefault('application/json');

            const match = registry.negotiate('*/*');
            expect(match).toBe(jsonTransformer);
        });

        it("should handle */* by returning undefined if no default set", () => {
            const registry = new ResponseTransformerRegistry();
            const jsonTransformer = {
                contentType: 'application/json',
                serialize: (data: any) => ({ body: '{}' })
            };
            registry.register(jsonTransformer);

            const match = registry.negotiate('*/*');
            expect(match).toBeUndefined();
        });
    });
});
