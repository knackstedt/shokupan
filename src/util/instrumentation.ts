import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { Middleware, ShokupanHandler } from "./types";

const tracer = trace.getTracer("shokupan.middleware");

/**
 * Wraps a middleware function with an OpenTelemetry span.
 */
export function traceMiddleware(fn: Middleware, name?: string): Middleware {
    const middlewareName = name || fn.name || "anonymous middleware";

    return async (ctx, next) => {
        return tracer.startActiveSpan(`middleware - ${middlewareName}`, {
            kind: SpanKind.INTERNAL,
            attributes: {
                "code.function": middlewareName,
                "component": "shokupan.middleware"
            }
        }, async (span) => {
            try {
                const result = await fn(ctx, next);
                return result;
            }
            catch (err: any) {
                span.recordException(err);
                span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
                throw err;
            }
            finally {
                span.end();
            }
        });
    };
}

/**
 * Wraps a route handler with an OpenTelemetry span.
 */
export function traceHandler(fn: ShokupanHandler | ((...args: any[]) => any), name: string): ShokupanHandler {
    return async function (this: any, ...args: any[]) {
        return tracer.startActiveSpan(`route handler - ${name}`, {
            kind: SpanKind.INTERNAL,
            attributes: {
                "http.route": name,
                "component": "shokupan.route"
            }
        }, async (span) => {
            try {
                const result = await (fn as Function).apply(this, args);
                return result;
            }
            catch (err: any) {
                span.recordException(err);
                span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
                throw err;
            }
            finally {
                span.end();
            }
        });
    };
}
