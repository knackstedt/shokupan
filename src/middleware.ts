import { RecordId } from 'surrealdb';
import type { ShokupanContext } from "./context";
import { $debug } from './util/symbol';
import type { Middleware, NextFn } from './util/types';

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

            if (typeof fn !== 'function') {
                const name = (fn as any)?.constructor?.name;
                console.error(`[Middleware Error] Item at index ${i} is not a function! It is: ${typeof fn} (${name})`, fn);
                throw new TypeError(`Middleware at index ${i} must be a function, got ${name}`);
            }

            // --- Tracking Setup ---
            const trackingEnabled = context.app?.applicationConfig?.enableMiddlewareTracking;
            const meta = fn.metadata;
            let trackingStartTime = 0;

            if (trackingEnabled && meta) {
                trackingStartTime = performance.now();
                context.handlerStack.push({
                    name: meta.name || fn.name || 'anonymous',
                    file: meta.file,
                    line: meta.line,
                    isBuiltin: meta.isBuiltin,
                    startTime: trackingStartTime,
                    duration: -1
                });
            }

            // --- Debug Setup ---
            const debug = context[$debug];
            let debugId: string | undefined;
            let previousNode: string | undefined;
            let debugStart = 0;

            if (debug) {
                debugId = (fn as any)._debugId || fn.name || 'anonymous';
                previousNode = debug.getCurrentNode();
                debug.trackEdge(previousNode, debugId);
                debug.setNode(debugId!);
                debugStart = performance.now();
            }

            try {
                // Execute Middleware
                const res = await fn(context, () => runner(i + 1));

                // --- Tracking Success ---
                if (trackingEnabled && meta) {
                    const duration = performance.now() - trackingStartTime;
                    const stackItem = context.handlerStack[context.handlerStack.length - 1];
                    if (stackItem) stackItem.duration = duration;

                    Promise.resolve().then(async () => {
                        try {
                            const db = context.app?.db;
                            if (!db) return;

                            const timestamp = Date.now();
                            await db.upsert(new RecordId('middleware_tracking', {
                                timestamp,
                                name: meta.name
                            }), {
                                name: meta.name,
                                path: context.path,
                                timestamp,
                                duration,
                                file: meta.file,
                                line: meta.line,
                                error: undefined,
                                metadata: {
                                    isBuiltin: meta.isBuiltin,
                                    pluginName: meta.pluginName
                                }
                            });
                        } catch (e) { }
                    });
                }

                // --- Debug Success ---
                if (debug) {
                    debug.trackStep(debugId, 'middleware', performance.now() - debugStart, 'success');
                }

                return res;

            } catch (err) {
                // --- Tracking Error ---
                if (trackingEnabled && meta) {
                    const duration = performance.now() - trackingStartTime;
                    const stackItem = context.handlerStack[context.handlerStack.length - 1];
                    if (stackItem) stackItem.duration = duration;

                    Promise.resolve().then(async () => {
                        try {
                            const db = context.app?.db;
                            if (!db) return;

                            const timestamp = Date.now();
                            await db.upsert(new RecordId('middleware_tracking', {
                                timestamp,
                                name: meta.name
                            }), {
                                name: meta.name,
                                path: context.path,
                                timestamp,
                                duration,
                                file: meta.file,
                                line: meta.line,
                                error: String(err),
                                metadata: {
                                    isBuiltin: meta.isBuiltin,
                                    pluginName: meta.pluginName
                                }
                            });
                        } catch (e) { }
                    });
                }

                // --- Debug Error ---
                if (debug) {
                    debug.trackStep(debugId, 'middleware', performance.now() - debugStart, 'error', err);
                }

                throw err;
            } finally {
                if (debug && previousNode) debug.setNode(previousNode);
            }
        }

        return runner(0);
    };
};
