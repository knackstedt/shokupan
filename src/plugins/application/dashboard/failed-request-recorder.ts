import { trace } from '@opentelemetry/api';
import type { ShokupanContext } from '../../../context';
import type { Middleware } from '../../../util/types';

export interface FailedRequestRecorderOptions {
    /**
     * Maximum number of failed requests to keep.
     * @default 10000
     */
    maxCapacity?: number;
    /**
     * Time to live for failed requests in milliseconds.
     * @default 86400000 (1 day)
     */
    ttl?: number;
}

export function FailedRequestRecorder(options: FailedRequestRecorderOptions = {}): Middleware {
    const maxCapacity = options.maxCapacity ?? 10000;
    const ttl = options.ttl ?? 86400000;

    const recorderMiddleware: Middleware = async (ctx: ShokupanContext, next) => {
        try {
            return await next();
        } catch (err: any) {
            // Capture the error
            await recordFailedRequest(ctx, err, maxCapacity, ttl);
            // Re-throw so standard error handling (or other middleware) can process it
            throw err;
        }
    };
    recorderMiddleware.isBuiltin = true;
    recorderMiddleware.pluginName = 'FailedRequestRecorder';

    return recorderMiddleware;
}

async function recordFailedRequest(ctx: ShokupanContext, error: any, maxCapacity: number, ttl: number) {
    try {
        const timestamp = Date.now();
        const requestPath = ctx.path;
        const method = ctx.method;

        let body: any = "unknown";
        try {
            // Attempt to capture body if available on strict context or if previously parsed
            if ((ctx as any)._body !== undefined) {
                body = (ctx as any)._body;
            }
        } catch { }

        const errorMsg = error.message || String(error);

        const data: any = {
            path: requestPath,
            method: method,
            body: body,
            error: errorMsg,
            timestamp
        };

        // Middleware Tracking
        if (ctx.app?.applicationConfig.enableMiddlewareTracking && ctx.handlerStack) {
            data.middlewareStack = ctx.handlerStack;
        }

        // OpenTelemetry
        if (ctx.app?.applicationConfig.enableTracing) {
            const span = trace.getActiveSpan();
            if (span) {
                const spanContext = span.spanContext();
                data.otel = {
                    traceId: spanContext.traceId,
                    spanId: spanContext.spanId
                };
            }
        }

        // Store
        try {
            // Use random ID since timestamp provides enough uniqueness scope usually
            const id = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;

            await ctx.app.db.upsert('failed_requests', id, {
                id,
                ...data
            });
        } catch (err: any) {
            // Duplicate handling if any
            if (err.message && err.message.includes("exists")) {
                return;
            }
            throw err;
        }

        // Cleanup Background Task
        cleanup(ctx, maxCapacity, ttl).catch(() => { });

    } catch (e) {
        ctx.logger?.error('FailedRequestRecorder', "Failed to record failed request:", { error: e });
    }
}

async function cleanup(ctx: ShokupanContext, maxCapacity: number, ttl: number) {
    const cutoff = Date.now() - ttl;

    // Delete expired
    await ctx.app.db.deleteMany('failed_requests', {
        lt: { timestamp: cutoff }
    });

    // Check capacity
    const count = await ctx.app.db.count('failed_requests');

    if (count > maxCapacity) {
        const toDelete = count - maxCapacity;
        await ctx.app.db.deleteMany('failed_requests', {
            sort: { timestamp: 'asc' },
            limit: toDelete
        });
    }
}
