
import { ShokupanContext } from "../../../context";
import type { Shokupan } from "../../../shokupan";
import type { Middleware, ShokupanHandler, ShokupanPlugin } from "../../../util/types";

export interface OpenTelemetryOptions {
    /**
     * Service name for traces
     */
    serviceName?: string;
    /**
     * Enable auto-instrumentation
     * @default true
     */
    enableAutoInstrumentation?: boolean;
    /**
     * OTLP Endpoint (e.g. http://localhost:4318)
     */
    otlpEndpoint?: string;
}

export class OpenTelemetryPlugin implements ShokupanPlugin {
    private api: typeof import("@opentelemetry/api");
    private sdk: any;

    constructor(private options: OpenTelemetryOptions = {}) { }

    async onInit(app: Shokupan) {
        try {
            this.api = await import("@opentelemetry/api");
            // If we wanted to initialize a full NodeSDK here, we would need @opentelemetry/sdk-node
            // which might not be installed. For now we just provide the API wrapper and middleware.
            // In a real expanded plugin, we'd try to import sdk-node and start it if configured.
        } catch (e) {
            console.warn("OpenTelemetry API not found. OpenTelemetryPlugin will be disabled.");
            return;
        }

        if (this.options.enableAutoInstrumentation !== false) {
            app.use(this.middleware());
        }
    }

    middleware(): Middleware {
        return async (ctx: ShokupanContext, next: () => Promise<any>) => {
            if (!this.api) return next();

            const tracer = this.api.trace.getTracer("shokupan");

            // Extract context from headers (propagated from upstream)
            // const activeContext = this.api.propagation.extract(this.api.context.active(), ctx.req.headers);

            return tracer.startActiveSpan(`${ctx.req.method} ${ctx.req.path}`, {
                kind: this.api.SpanKind.SERVER,
                attributes: {
                    "http.method": ctx.req.method,
                    "http.url": ctx.req.url,
                    "http.host": ctx.req.host,
                    "http.user_agent": ctx.req.headers.get("user-agent") || undefined
                }
            }, async (span: any) => {
                try {
                    const res = await next();
                    span.setAttributes({
                        "http.status_code": ctx.res.status
                    });
                    if (ctx.res.status >= 500) {
                        span.setStatus({ code: this.api.SpanStatusCode.ERROR });
                    } else {
                        span.setStatus({ code: this.api.SpanStatusCode.OK });
                    }
                    return res;
                } catch (err: any) {
                    span.recordException(err);
                    span.setStatus({ code: this.api.SpanStatusCode.ERROR, message: err.message });
                    throw err;
                } finally {
                    span.end();
                }
            });
        };
    }
}

/**
 * Wraps a middleware function with an OpenTelemetry span.
 */
export function traceMiddleware(fn: Middleware, name?: string): Middleware {
    let api: typeof import("@opentelemetry/api");
    try { api = require('@opentelemetry/api'); } catch { }

    if (!api) return fn;

    const tracer = api.trace.getTracer("shokupan.middleware");
    const middlewareName = name || fn.name || "anonymous middleware";

    return async (ctx, next) => {
        return tracer.startActiveSpan(`middleware - ${middlewareName}`, {
            kind: api.SpanKind.INTERNAL,
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
                span.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
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
    let api: typeof import("@opentelemetry/api");
    try { api = require('@opentelemetry/api'); } catch { }

    if (!api) return fn as ShokupanHandler;

    const tracer = api.trace.getTracer("shokupan.middleware");

    return async function (this: any, ...args: any[]) {
        return tracer.startActiveSpan(`route handler - ${name}`, {
            kind: api.SpanKind.INTERNAL,
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
                span.setStatus({ code: api.SpanStatusCode.ERROR, message: err.message });
                throw err;
            }
            finally {
                span.end();
            }
        });
    };
}
