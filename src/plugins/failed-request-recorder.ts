import { trace } from '@opentelemetry/api';
import { createHash } from 'node:crypto';
import type { ShokupanContext } from '../context';
import type { Middleware } from '../types';
import { datastore } from '../util/datastore';

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

        const hashInput = `${requestPath}|${method}|${JSON.stringify(body)}|${errorMsg}|${timestamp}`;
        const id = createHash('sha256').update(hashInput).digest('hex');

        // Store
        try {
            await datastore.set('failed_requests', id, data);
        } catch (err: any) {
            // If it already exists, we can ignore it (duplicate failure)
            if (err.message && err.message.includes("already exists")) {
                return;
            }
            throw err;
        }

        // Cleanup Background Task
        cleanup(maxCapacity, ttl).catch(() => { });

    } catch (e) {
        console.error("Failed to record failed request:", e);
    }
}

async function cleanup(maxCapacity: number, ttl: number) {
    const cutoff = Date.now() - ttl;

    // Delete expired
    await datastore.query(`DELETE failed_requests WHERE timestamp < ${cutoff}`);

    // Check capacity
    const results = await datastore.query('SELECT count() FROM failed_requests GROUP ALL');

    // Results is [{ result: [{ count: N }], status: 'OK', ... }]
    if (!results?.[0]?.result) return;

    const countRecords = results[0].result as any[];

    if (!Array.isArray(countRecords) || countRecords.length === 0) return;

    const count = countRecords[0].count || 0;

    if (count > maxCapacity) {
        const toDelete = count - maxCapacity;
        await datastore.query(`DELETE failed_requests ORDER BY timestamp ASC LIMIT ${toDelete}`);
    }
}
