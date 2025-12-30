import type { ShokupanContext } from "./context";
import type { Middleware, NextFn } from './types';

/**
 * Composes a list of middleware into a single function.
 * This is the onion model (Koa-style).
 * 
 * CRITICAL: This must build the chain ONCE, not rebuild it on every request.
 */
export const compose = (middleware: Middleware[]) => {
    if (!middleware.length) {
        return (context: ShokupanContext<unknown>, next?: NextFn) => {
            return next ? next() : Promise.resolve();
        };
    }

    return function dispatch(context: ShokupanContext<unknown>, next?: NextFn): Promise<any> {
        let index = -1;

        function runner(i: number): Promise<any> {
            if (i <= index) return Promise.reject(new Error('next() called multiple times'));
            index = i;

            if (i >= middleware.length) {
                return next ? next() : Promise.resolve();
            }

            const fn = middleware[i];
            try {
                return Promise.resolve(fn(context, () => runner(i + 1)));
            } catch (err) {
                return Promise.reject(err);
            }
        }

        return runner(0);
    };
};


