import type { ShokupanContext } from "./context";
import type { Middleware, NextFn } from './types';
import { traceMiddleware } from "./util/instrumentation";

/**
 * Composes a list of middleware into a single function.
 * This is the onion model (Koa-style).
 */
export const compose = (middleware: Middleware[]) => {
    function fn(context: ShokupanContext<unknown>, next?: NextFn) {
        let runner: NextFn = next || (async () => { });

        for (let i = middleware.length - 1; i >= 0; i--) {
            const fn = traceMiddleware(middleware[i]);
            const nextStep = runner;
            let called = false;

            runner = async () => {
                if (called) throw new Error('next() called multiple times');
                called = true;
                return fn(context, nextStep);
            };
        }

        return runner();
    };

    return fn;
};

/**
 * Adapter to use legacy Express middleware.
 * NOTE: This provides a PARTIAL mock of req/res.
 */
export function useExpress(expressMiddleware: any): Middleware {
    return async (ctx, next) => {
        return new Promise((resolve, reject) => {
            // Mock Request
            // Express middleware often mutates req, but Request is readonly.
            // We use a Proxy to intercept writes and store them locally.
            const reqStore: any = {
                method: ctx.method,
                url: ctx.url.pathname + ctx.url.search,
                path: ctx.url.pathname,
                query: ctx.query,
                headers: ctx.headers,
                get: (name: string) => ctx.headers.get(name)
            };

            const req = new Proxy(ctx.request, {
                get(target, prop) {
                    if (prop in reqStore) return reqStore[prop];
                    const val = (target as any)[prop];
                    if (typeof val === 'function') return val.bind(target);
                    return val;
                },
                set(target, prop, value) {
                    reqStore[prop] = value;
                    ctx.state[prop as string] = value;
                    return true;
                }
            });

            // Mock Response (res)
            const res: any = {
                locals: {},
                statusCode: 200,
                setHeader: (name: string, value: string) => {
                    ctx.response.headers.set(name, value);
                },
                set: (name: string, value: string) => {
                    ctx.response.headers.set(name, value);
                },
                end: (chunk: any) => {
                    resolve(new Response(chunk, { status: res.statusCode }));
                },
                status: (code: number) => {
                    res.statusCode = code;
                    return res;
                },
                send: (body: any) => {
                    let content = body;
                    if (typeof body === 'object') content = JSON.stringify(body);
                    resolve(new Response(content, { status: res.statusCode }));
                },
                json: (body: any) => {
                    resolve(Response.json(body, { status: res.statusCode }));
                }
            };

            // Execute
            try {
                expressMiddleware(req, res, (err: any) => {
                    if (err) return reject(err);
                    resolve(next());
                });
            } catch (err) {
                reject(err);
            }
        });
    };
}
