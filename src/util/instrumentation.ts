import type { Middleware, ShokupanHandler } from "./types";

let trace: any;
let SpanKind: any;
let SpanStatusCode: any;

try {
    const otel = require('@opentelemetry/api');
    trace = otel.trace;
    SpanKind = otel.SpanKind;
    SpanStatusCode = otel.SpanStatusCode;
} catch (e) {
    // OpenTelemetry not available
}

/**
 * Wraps a middleware function with an OpenTelemetry span.
 */
export function traceMiddleware(fn: Middleware, name?: string): Middleware {
    if (!trace) return fn;

    const tracer = trace.getTracer("shokupan.middleware");
    const middlewareName = name || fn.name || "anonymous middleware";

    return async (ctx, next) => {
        return tracer.startActiveSpan(`middleware - ${middlewareName}`, {
            kind: SpanKind.INTERNAL,
            attributes: {
                "code.function": middlewareName,
                "component": "shokupan.middleware"
            }
        }, async (span: any) => {
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
    if (!trace) return fn as ShokupanHandler;

    const tracer = trace.getTracer("shokupan.middleware");

    return async function (this: any, ...args: any[]) {
        return tracer.startActiveSpan(`route handler - ${name}`, {
            kind: SpanKind.INTERNAL,
            attributes: {
                "http.route": name,
                "component": "shokupan.route"
            }
        }, async (span: any) => {
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
