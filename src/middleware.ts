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


