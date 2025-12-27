import type { ShokupanContext } from "../context";
import type { Middleware, NextFn } from "../types";

export interface CorsOptions {
    origin?: string | string[] | ((ctx: ShokupanContext) => string | undefined | null | boolean);
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
}

export function Cors(options: CorsOptions = {}): Middleware {
    const defaults: CorsOptions = {
        origin: "*",
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
        preflightContinue: false,
        optionsSuccessStatus: 204
    } as any;

    const opts = { ...defaults, ...options };

    return async (ctx: ShokupanContext, next: NextFn) => {
        const headers = new Headers();
        const origin = ctx.headers.get("origin");

        const set = (k: string, v: string) => headers.set(k, v);
        const append = (k: string, v: string) => headers.append(k, v);

        // Set Access-Control-Allow-Origin
        if (opts.origin === "*") {
            set("Access-Control-Allow-Origin", "*");
        } else if (typeof opts.origin === "string") {
            set("Access-Control-Allow-Origin", opts.origin);
        } else if (Array.isArray(opts.origin)) {
            if (origin && opts.origin.includes(origin)) {
                set("Access-Control-Allow-Origin", origin);
                append("Vary", "Origin");
            }
        } else if (typeof opts.origin === "function") {
            const allowed = opts.origin(ctx);
            if (allowed === true && origin) {
                set("Access-Control-Allow-Origin", origin);
                append("Vary", "Origin");
            } else if (typeof allowed === 'string') {
                set("Access-Control-Allow-Origin", allowed);
                append("Vary", "Origin");
            }
        }

        // Access-Control-Allow-Credentials
        if (opts.credentials) {
            set("Access-Control-Allow-Credentials", "true");
        }

        // Access-Control-Expose-Headers
        if (opts.exposedHeaders) {
            const exposed = Array.isArray(opts.exposedHeaders) ? opts.exposedHeaders.join(",") : opts.exposedHeaders;
            if (exposed) set("Access-Control-Expose-Headers", exposed);
        }

        // Handle Preflight
        if (ctx.method === "OPTIONS") {
            // Access-Control-Allow-Methods
            if (opts.methods) {
                const methods = Array.isArray(opts.methods) ? opts.methods.join(",") : opts.methods;
                set("Access-Control-Allow-Methods", methods);
            }

            // Access-Control-Allow-Headers
            if (opts.allowedHeaders) {
                const h = Array.isArray(opts.allowedHeaders) ? opts.allowedHeaders.join(",") : opts.allowedHeaders;
                set("Access-Control-Allow-Headers", h);
            } else {
                // Reflect request headers if not specified
                const reqHeaders = ctx.headers.get("access-control-request-headers");
                if (reqHeaders) {
                    set("Access-Control-Allow-Headers", reqHeaders);
                    append("Vary", "Access-Control-Request-Headers");
                }
            }

            // Access-Control-Max-Age
            if (opts.maxAge) {
                set("Access-Control-Max-Age", String(opts.maxAge));
            }

            return new Response(null, {
                status: (opts as any).optionsSuccessStatus || 204,
                headers
            });
        }

        const response = await next();

        if (response instanceof Response) {
            for (const [key, value] of headers.entries()) {
                response.headers.set(key, value);
            }
        }

        return response;
    };
}
