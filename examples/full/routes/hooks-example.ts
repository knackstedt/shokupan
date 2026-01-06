import { ShokupanRouter } from '../../../src/router';
import type { ShokupanHooks } from '../../../src/util/types';

/**
 * Event Hooks Examples
 * 
 * This demonstrates all available hooks in Shokupan:
 * - onError: Error handling
 * - onRequestStart: Called when request begins
 * - onRequestEnd: Called when request ends
 * - onResponseStart: Called when response is being sent
 * - onResponseEnd: Called after response is sent
 * - beforeValidate: Before validation runs
 * - afterValidate: After validation succeeds
 * - onRequestTimeout: Request timeout handler
 * - onReadTimeout: Read timeout handler
 * - onWriteTimeout: Write timeout handler
 */

// App-level hooks (passed in ShokupanConfig)
export const appLevelHooks: ShokupanHooks = {
    onError: async (error, ctx) => {
        console.log('[APP HOOK] onError:', error);
        // Log to monitoring service, etc.
    },

    onRequestStart: async (ctx) => {
        console.log(`[APP HOOK] onRequestStart: ${ctx.method} ${ctx.path}`);
        // Start request timing, set request ID, etc.
        ctx.state.requestStartTime = Date.now();
    },

    onRequestEnd: async (ctx) => {
        const duration = Date.now() - (ctx.state.requestStartTime || 0);
        console.log(`[APP HOOK] onRequestEnd: ${ctx.method} ${ctx.path} (${duration}ms)`);
        // Log request metrics
    },

    onResponseStart: async (ctx, response) => {
        console.log(`[APP HOOK] onResponseStart: ${response.status}`);
        // Add response headers, start response timing, etc.
    },

    onResponseEnd: async (ctx, response) => {
        console.log(`[APP HOOK] onResponseEnd: ${response.status}`);
        // Final cleanup, send metrics, etc.
    },

    beforeValidate: async (ctx, data) => {
        console.log('[APP HOOK] beforeValidate:', Object.keys(data || {}));
        // Pre-process validation data, sanitize input, etc.
    },

    afterValidate: async (ctx, data) => {
        console.log('[APP HOOK] afterValidate: Validation passed');
        // Post-process validated data, audit log, etc.
    },

    onRequestTimeout: async (ctx) => {
        console.log('[APP HOOK] onRequestTimeout: Request took too long');
        // Log timeout, alert monitoring, etc.
    },

    onReadTimeout: async (ctx) => {
        console.log('[APP HOOK] onReadTimeout: Reading request body took too long');
    },

    onWriteTimeout: async (ctx) => {
        console.log('[APP HOOK] onWriteTimeout: Writing response took too long');
    }
};

// Router with its own hooks
export class HooksExampleRouter extends ShokupanRouter {
    constructor() {
        super({
            name: 'Hooks Example Router',
            group: 'hooks',
            hooks: {
                onError: async (error, ctx) => {
                    console.log('[ROUTER HOOK] onError in HooksExampleRouter:', error);
                },

                onRequestStart: async (ctx) => {
                    console.log(`[ROUTER HOOK] onRequestStart: ${ctx.path}`);
                    ctx.state.routerStartTime = Date.now();
                },

                onRequestEnd: async (ctx) => {
                    const duration = Date.now() - (ctx.state.routerStartTime || 0);
                    console.log(`[ROUTER HOOK] onRequestEnd: ${ctx.path} (${duration}ms)`);
                }
            }
        });

        // Example 1: Normal route (hooks will fire)
        this.get('/normal',
            {
                summary: 'Normal Request',
                description: 'Demonstrates normal request/response hooks',
                tags: ['Hooks']
            },
            (ctx) => {
                return ctx.json({
                    message: 'Normal request',
                    note: 'Check console for hook logs',
                    hooks: [
                        'onRequestStart (app + router)',
                        'onResponseStart (app)',
                        'onResponseEnd (app)',
                        'onRequestEnd (app + router)'
                    ]
                });
            }
        );

        // Example 2: Route that triggers error hook
        this.get('/error',
            {
                summary: 'Trigger Error Hook',
                description: 'Intentionally throws an error to demonstrate error hooks',
                tags: ['Hooks', 'Error Handling']
            },
            (ctx) => {
                throw new Error('Intentional error to demonstrate onError hook');
            }
        );

        // Example 3: Route with validation (triggers validation hooks)
        this.post('/validate',
            {
                summary: 'Validation Hooks',
                description: 'Demonstrates beforeValidate and afterValidate hooks',
                tags: ['Hooks', 'Validation']
            },
            // Note: In a real implementation, you'd add validation middleware here
            async (ctx) => {
                const body = await ctx.body();
                return ctx.json({
                    message: 'Data validated',
                    note: 'Check console for beforeValidate and afterValidate hooks',
                    data: body,
                    hooks: ['beforeValidate (app)', 'afterValidate (app)']
                });
            }
        );

        // Example 4: Slow route (for timeout demonstration)
        this.get('/slow',
            {
                summary: 'Slow Request',
                description: 'Simulates a slow request (useful for timeout testing)',
                tags: ['Hooks', 'Timeout']
            },
            async (ctx) => {
                const delay = parseInt(ctx.query.delay || '1000');
                await new Promise(resolve => setTimeout(resolve, delay));

                return ctx.json({
                    message: 'Slow request completed',
                    delay,
                    note: 'Use ?delay=5000 to test request timeouts'
                });
            }
        );

        // Example 5: Route with custom state
        this.get('/stateful',
            {
                summary: 'Stateful Request',
                description: 'Demonstrates using ctx.state across hooks',
                tags: ['Hooks', 'State']
            },
            (ctx) => {
                // State set by hooks can be accessed here
                return ctx.json({
                    message: 'Stateful request',
                    state: {
                        requestStartTime: ctx.state.requestStartTime,
                        routerStartTime: ctx.state.routerStartTime
                    },
                    note: 'Hooks can set state for use in handlers'
                });
            }
        );

        // Example 6: Multiple hooks demonstration
        this.post('/multi-hook',
            {
                summary: 'Multiple Hooks',
                description: 'Route that triggers multiple hook types',
                tags: ['Hooks']
            },
            async (ctx) => {
                const body = await ctx.body();

                // All these hooks fire:
                // 1. onRequestStart (app + router)
                // 2. beforeValidate (if validation middleware present)
                // 3. afterValidate (if validation passes)
                // 4. onResponseStart (app)
                // 5. onResponseEnd (app)
                // 6. onRequestEnd (app + router)

                return ctx.json({
                    message: 'Multi-hook request completed',
                    body,
                    hooksFired: [
                        'onRequestStart (app + router)',
                        'beforeValidate (app)',
                        'afterValidate (app)',
                        'onResponseStart (app)',
                        'onResponseEnd (app)',
                        'onRequestEnd (app + router)'
                    ]
                });
            }
        );

        // Example 7: Hook order demonstration
        this.get('/hook-order',
            {
                summary: 'Hook Execution Order',
                description: 'Returns information about hook execution order',
                tags: ['Hooks']
            },
            (ctx) => {
                return ctx.json({
                    message: 'Hook execution order',
                    order: [
                        '1. onRequestStart (app)',
                        '2. onRequestStart (router)',
                        '3. beforeValidate (app, if validation)',
                        '4. [validation runs]',
                        '5. afterValidate (app, if validation succeeds)',
                        '6. [route handler executes]',
                        '7. onResponseStart (app)',
                        '8. onResponseEnd (app)',
                        '9. onRequestEnd (router)',
                        '10. onRequestEnd (app)'
                    ],
                    note: 'If error occurs, onError fires and normal flow is interrupted'
                });
            }
        );
    }
}

// Example of per-route hooks (not router-wide)
export class PerRouteHooksRouter extends ShokupanRouter {
    constructor() {
        super({
            name: 'Per-Route Hooks',
            group: 'hooks'
        });

        // This route has its own hooks config
        this.get('/custom-hooks',
            {
                summary: 'Custom Route Hooks',
                description: 'This route has custom hooks that override router/app hooks',
                tags: ['Hooks'],
                // Note: In actual implementation, hooks might be passed differently
                // This is demonstrating the concept
            },
            (ctx) => {
                return ctx.json({
                    message: 'Route with custom hooks',
                    note: 'This route can have its own hook configuration'
                });
            }
        );
    }
}
