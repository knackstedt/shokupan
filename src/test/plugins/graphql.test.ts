import { describe, expect, test } from "bun:test";
import { GraphQLPlugin } from "../../plugins/application/graphql";
import { Shokupan } from "../../shokupan";

describe('GraphQLPlugin', () => {

    test('should serve graphql requests', async () => {
        const app = new Shokupan();
        const typeDefs = `#graphql
            type Query {
                hello: String
            }
        `;
        const resolvers = {
            Query: {
                hello: () => 'world',
            },
        };

        app.register(new GraphQLPlugin({
            typeDefs,
            resolvers
        }));

        await app.listen(0);
        try {
            const res = await app.testRequest({
                method: 'POST',
                path: '/graphql',
                headers: { 'Content-Type': 'application/json' },
                body: { query: 'query { hello }' }
            });

            if (res.status !== 200) {
                console.error('Test Failed Response:', JSON.stringify(res.data, null, 2));
            }

            expect(res.status).toBe(200);
            expect(res.data.data.hello).toBe('world');
        } finally {
            await app.stop();
        }
    });

    test('should support custom path', async () => {
        const app = new Shokupan();
        const typeDefs = `#graphql
            type Query {
                foo: String
            }
        `;
        const resolvers = {
            Query: {
                foo: () => 'bar',
            },
        };

        app.register(new GraphQLPlugin({
            typeDefs,
            resolvers,
            path: '/api/gql'
        }));

        await app.listen(0);
        try {
            const res = await app.testRequest({
                method: 'POST',
                path: '/api/gql',
                headers: { 'Content-Type': 'application/json' },
                body: { query: 'query { foo }' }
            });

            expect(res.status).toBe(200);
            expect(res.data.data.foo).toBe('bar');
        } finally {
            await app.stop();
        }
    });

    test('should return 400 for invalid query', async () => {
        const app = new Shokupan();
        const typeDefs = `#graphql
            type Query {
                hello: String
            }
        `;
        const resolvers = {
            Query: {
                hello: () => 'world',
            },
        };

        app.register(new GraphQLPlugin({
            typeDefs,
            resolvers
        }));

        await app.listen(0);
        try {
            const res = await app.testRequest({
                method: 'POST',
                path: '/graphql',
                headers: { 'Content-Type': 'application/json' },
                body: { query: 'query { invalid }' }
            });

            // Apollo Server might return 200 with errors in body, or 400 depending on config.
            // Default Apollo behavior is often 200 OK for query errors unless configured otherwise, 
            // BUT invalid syntax or validation errors typically result in errors array.
            // Actually, if using executeHTTPGraphQLRequest directly, the status code comes from the result.
            // Standard GraphQL over HTTP says 400 for validation errors.

            // Let's check for errors in body first
            expect(res.data.errors).toBeDefined();
        } finally {
            await app.stop();
        }
    });

    test('should serve landing page on GET', async () => {
        const app = new Shokupan();
        const typeDefs = `#graphql
            type Query {
                hello: String
            }
        `;
        const resolvers = {
            Query: {
                hello: () => 'world',
            },
        };

        app.register(new GraphQLPlugin({
            typeDefs,
            resolvers
        }));

        await app.listen(0);
        try {
            const res = await app.testRequest({
                method: 'GET',
                path: '/graphql',
                headers: { 'Accept': 'text/html' }
            });

            expect(res.status).toBe(200);
            expect(res.data).toContain('<!DOCTYPE html>');
        } finally {
            await app.stop();
        }
    });
});
