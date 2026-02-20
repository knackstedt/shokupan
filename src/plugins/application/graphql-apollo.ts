import type { ApolloServer } from '@apollo/server';
import { ShokupanRouter } from '../../router';
import type { Shokupan } from '../../shokupan';
import { $isMounted } from '../../util/symbol';
import type { ShokupanPlugin, ShokupanPluginOptions } from '../../util/types';

export interface GraphQLPluginOptions {
    /**
     * Path to mount the GraphQL endpoint to.
     * @default '/graphql'
     */
    path?: string;

    /**
     * GraphQL Type Definitions
     */
    typeDefs: any;

    /**
     * GraphQL Resolvers
     */
    resolvers: any;

    /**
     * Optional Apollo Server configuration
     */
    apolloConfig?: Omit<ConstructorParameters<typeof ApolloServer>[0], 'typeDefs' | 'resolvers'>;
}

/**
 * GraphQL Apollo Server Plugin for Shokupan.
 * Enables serving GraphQL APIs using Apollo Server 4.
 */
export class GraphQLApolloPlugin extends ShokupanRouter<any> implements ShokupanPlugin {
    private apolloServer: ApolloServer<any>; // Use generic any or verify type

    constructor(private pluginOptions: GraphQLPluginOptions) {
        super();
        this.pluginOptions.path ??= '/graphql';
    }

    async onInit(app: Shokupan, options?: ShokupanPluginOptions) {
        // Load peer dependencies
        const { ApolloServer, HeaderMap } = await import('@apollo/server');

        this.apolloServer = new ApolloServer({
            typeDefs: this.pluginOptions.typeDefs,
            resolvers: this.pluginOptions.resolvers,
            ...(this.pluginOptions.apolloConfig || {} as any),
        });

        const path = options?.path || this.pluginOptions.path || '/graphql';
        if (!(this as any)[$isMounted]) {
            app.mount(path, this);
        }


        // Ensure Apollo Server is started before handling requests
        // app.onStart() ensures this runs before the server listens
        app.onStart(async () => {
            await this.apolloServer.start();
        });

        // Handle POST requests for GraphQL operations
        this.post('/', async (ctx) => {
            // Ensure body is parsed
            const body = await ctx.body();

            const httpGraphQLResponse = await this.apolloServer.executeHTTPGraphQLRequest({
                httpGraphQLRequest: {
                    body,
                    method: ctx.req.method,
                    search: ctx.url.search,
                    headers: new HeaderMap(ctx.req.headers),
                },
                // Pass the Shokupan Context as the GraphQL Context
                context: async () => ({ ...ctx, shokupan: ctx }),
            });

            // Set Headers
            for (const [key, value] of httpGraphQLResponse.headers) {
                ctx.set(key, value);
            }

            // Send Response
            if (httpGraphQLResponse.body.kind === 'complete') {
                return ctx.send(httpGraphQLResponse.body.string, {
                    status: httpGraphQLResponse.status ?? 200,
                });
            } else {
                // Basic support for chunked responses (e.g. invalid query iterator or future defer/stream)
                // For full stream support, we might need a more advanced stream handler
                let string = '';
                for await (const chunk of httpGraphQLResponse.body.asyncIterator) {
                    string += chunk;
                }
                return ctx.send(string, {
                    status: httpGraphQLResponse.status ?? 200,
                });
            }
        });

        // Handle GET requests (Landing Page / Playground)
        this.get('/', async (ctx) => {
            const httpGraphQLResponse = await this.apolloServer.executeHTTPGraphQLRequest({
                httpGraphQLRequest: {
                    body: (Object.keys(ctx.query).length > 0) ? ctx.query : undefined,
                    method: ctx.req.method,
                    search: ctx.url.search,
                    headers: new HeaderMap(ctx.req.headers),
                },
                context: async () => ({ ...ctx, shokupan: ctx }),
            });

            // Set Headers
            for (const [key, value] of httpGraphQLResponse.headers) {
                ctx.set(key, value);
            }

            if (httpGraphQLResponse.body.kind === 'complete') {
                return ctx.html(httpGraphQLResponse.body.string, httpGraphQLResponse.status ?? 200);
            } else {
                let string = '';
                for await (const chunk of httpGraphQLResponse.body.asyncIterator) {
                    string += chunk;
                }
                return ctx.html(string, httpGraphQLResponse.status ?? 200);
            }
        });
    }
}
