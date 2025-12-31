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

        async function runner(i: number): Promise<any> {
            if (i <= index) return Promise.reject(new Error('next() called multiple times'));
            index = i;

            if (i >= middleware.length) {
                return next ? next() : Promise.resolve();
            }

            const fn = middleware[i];

            // Fast path: No debug tracking
            if (!context._debug) {
                return fn(context, () => runner(i + 1));
            }

            // Slow path: Debug tracking
            const debug = context._debug;
            const debugId = (fn as any)._debugId || fn.name || 'anonymous';
            const previousNode = debug.getCurrentNode();

            debug.trackEdge(previousNode, debugId);
            debug.setNode(debugId);

            const start = performance.now();
            try {
                const res = await Promise.resolve(fn(context, () => runner(i + 1)));
                debug.trackStep(debugId, 'middleware', performance.now() - start, 'success');
                return res;
            } catch (err) {
                debug.trackStep(debugId, 'middleware', performance.now() - start, 'error', err);
                return Promise.reject(err);
            } finally {
                if (previousNode) debug.setNode(previousNode);
            }
        }

        return runner(0);
    };
};


