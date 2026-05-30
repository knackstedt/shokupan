import { describe, expect, it } from 'bun:test';

describe('Sample 7: GraphQL API', () => {
    it('should import GraphQLYogaPlugin', async () => {
        const { GraphQLYogaPlugin } = await import('../../src/index');
        expect(GraphQLYogaPlugin).toBeDefined();
    }, { timeout: 15000 });

    it('should create an app instance', async () => {
        const { Shokupan } = await import('../../src/index');
        const app = new Shokupan({ port: 0 });
        expect(app).toBeDefined();
    }, { timeout: 15000 });
});
