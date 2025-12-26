import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import type { ConvectionHandler, Middleware } from "../types";

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'basic-service',
    }),
    spanProcessors: [
        new SimpleSpanProcessor(
            new OTLPTraceExporter({
                url: 'http://localhost:4318/v1/traces', // Default OTLP port
            })
        )
    ],
});
provider.register();

const tracer = trace.getTracer("convect.middleware");

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
                "component": "convection.middleware"
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
export function traceHandler(fn: ConvectionHandler | ((...args: any[]) => any), name: string): ConvectionHandler {
    return async function (this: any, ...args: any[]) {
        return tracer.startActiveSpan(`route handler - ${name}`, {
            kind: SpanKind.INTERNAL,
            attributes: {
                "http.route": name,
                "component": "convection.route"
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
