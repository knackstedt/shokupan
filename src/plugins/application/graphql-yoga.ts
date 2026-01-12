import type { YogaServerOptions } from 'graphql-yoga';
import { ShokupanRouter } from '../../router';
import type { Shokupan } from '../../shokupan';
import type { ShokupanPlugin, ShokupanPluginOptions } from '../../util/types';

export interface GraphQLYogaPluginOptions {
    /**
     * Path to mount the GraphQL endpoint to.
     * @default '/graphql'
     */
    path?: string;

    /**
     * Yoga Server configuration
     */
    yogaConfig: YogaServerOptions<any, any>;
}

/**
 * GraphQL Yoga Plugin for Shokupan.
 * Enables serving GraphQL APIs using GraphQL Yoga.
 */
export class GraphQLYogaPlugin extends ShokupanRouter<any> implements ShokupanPlugin {
    private yoga: any;

    constructor(private pluginOptions: GraphQLYogaPluginOptions) {
        super();
        this.pluginOptions.path ??= '/graphql';
    }

    async onInit(app: Shokupan, options?: ShokupanPluginOptions) {
        // Load peer dependency
        const { createYoga } = await import('graphql-yoga');

        const path = options?.path || this.pluginOptions.path || '/graphql';

        // Initialize Yoga instance
        this.yoga = createYoga({
            ...this.pluginOptions.yogaConfig,
            graphqlEndpoint: path,
        });

        app.mount(path, this);

        // Handle both GET and POST requests
        const handler = async (ctx: any) => {
            let body: any;
            if (ctx.req.method !== 'GET' && ctx.req.method !== 'HEAD') {
                body = await ctx.body();
                // Yoga expects a string or Buffer for the body in Request
                if (typeof body === 'object' && body !== null) {
                    body = JSON.stringify(body);
                }
            }

            const response = await this.yoga.fetch(
                new Request(ctx.req.url, {
                    method: ctx.req.method,
                    headers: ctx.req.headers as any,
                    body,
                }),
                {
                    ...ctx,
                }
            );

            // Set Headers
            response.headers.forEach((value: string, key: string) => {
                ctx.set(key, value);
            });

            // Send Response
            const text = await response.text();
            return ctx.send(text, {
                status: response.status,
            });
        };

        this.get('/', handler);
        this.post('/', handler);
        this.get('/*', handler);
        this.post('/*', handler);
    }
}
