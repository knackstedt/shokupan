
import { RecordId } from 'surrealdb';
import { ShokupanContext } from '../context';
import type { Middleware, ShokupanHandler } from '../util/types';

export class MiddlewareTracker {
    public static wrap(
        handler: Middleware | ShokupanHandler<any>,
        context: { file: string, line: number, name?: string, isBuiltin?: boolean, pluginName?: string; }
    ): any {
        const { file, line, name, isBuiltin, pluginName } = context;
        const handlerName = name || handler.name || 'anonymous';

        const trackedHandler = async (ctx: ShokupanContext<any>, next?: () => Promise<void>) => {
            if (!ctx.app?.applicationConfig.enableMiddlewareTracking) {
                // If tracking disabled, just run
                // Note: This check happens at runtime, but wrapper is applied at registration
                return handler(ctx, next);
            }

            const startTime = performance.now();
            let error: any = undefined;

            try {
                ctx.handlerStack.push({
                    name: handlerName,
                    file,
                    line,
                    isBuiltin,
                    startTime,
                    duration: -1
                });
                return await handler(ctx, next);
            } catch (e) {
                error = e;
                throw e;
            } finally {
                const duration = performance.now() - startTime;

                // Update duration in stack
                const stackItem = ctx.handlerStack[ctx.handlerStack.length - 1];
                if (stackItem && stackItem.name === handlerName) {
                    stackItem.duration = duration;
                }

                // Async store to DB
                Promise.resolve().then(async () => {
                    try {
                        const db = ctx.app?.db;
                        if (!db) return;

                        const timestamp = Date.now();
                        await db.upsert(new RecordId('middleware_tracking', {
                            timestamp,
                            name: handlerName
                        }), {
                            name: handlerName,
                            path: ctx.path,
                            timestamp,
                            duration,
                            file,
                            line,
                            error: error ? String(error) : undefined,
                            metadata: {
                                isBuiltin,
                                pluginName
                            }
                        });

                        // Cleanup logic could be moved to a background job or throttled
                        // For now we keep it simple or delegate to a separate Cleanup task
                    } catch (err) {
                        // Ignore
                    }
                });
            }
        };

        // Preserve metadata
        (trackedHandler as any).metadata = (handler as any).metadata || context;
        Object.defineProperty(trackedHandler, 'name', { value: handlerName });
        (trackedHandler as any).originalHandler = (handler as any).originalHandler || handler;

        return trackedHandler;
    }
}
