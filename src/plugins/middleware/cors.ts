import type { ShokupanContext } from "../../context";
import type { Middleware, NextFn } from "../../util/types";

export interface CorsOptions {
    /**
     * Origin to allow. Can be a string, array of strings, or function that returns a string.
     */
    origin?: string | string[] | ((ctx: ShokupanContext) => string | undefined | null | boolean);
    /**
     * HTTP methods to allow.
     */
    methods?: string | string[];
    /**
     * HTTP headers to allow.
     */
    allowedHeaders?: string | string[];
    /**
     * HTTP headers to expose.
     */
    exposedHeaders?: string | string[];
    /**
     * Whether to allow credentials.
     */
    credentials?: boolean;
    /**
     * Maximum age of preflight request.
     */
    maxAge?: number;
}

/**
 * CORS middleware.
 * @param options CORS options
 * @returns Middleware function
 */
export function Cors(options: CorsOptions = {}): Middleware {
    const defaults: CorsOptions = {
        origin: "*",
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
        preflightContinue: false,
        optionsSuccessStatus: 204
    } as any;

    const opts = { ...defaults, ...options };

    const corsMiddleware: Middleware = async function CorsMiddleware(ctx: ShokupanContext, next: NextFn) {
        const headers = new Headers();
        const origin = ctx.headers.get("origin");

        const set = (k: string, v: string) => headers.set(k, v);
        const append = (k: string, v: string) => headers.append(k, v);

        // Security: Reject null origin by default (can be used in attacks)
        if (origin === 'null' && opts.origin !== 'null') {
            // Null origin is not allowed unless explicitly set
            return next();
        }

        // Set Access-Control-Allow-Origin
        if (opts.origin === "*") {
            set("Access-Control-Allow-Origin", "*");
        } else if (typeof opts.origin === "string") {
            set("Access-Control-Allow-Origin", opts.origin);
        } else if (Array.isArray(opts.origin)) {
            if (origin) {
                // Security: Normalize origins for case-insensitive comparison
                const normalizedOrigin = origin.toLowerCase();
                const normalizedAllowed = opts.origin.map(o => o.toLowerCase());

                if (normalizedAllowed.includes(normalizedOrigin)) {
                    // Use the original (non-normalized) origin in the response
                    set("Access-Control-Allow-Origin", origin);
                    append("Vary", "Origin");
                }
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
            const headerEntries = Array.from(headers.entries());
            for (let i = 0; i < headerEntries.length; i++) {
                const [key, value] = headerEntries[i];
                response.headers.set(key, value);
            }
        }

        return response;
    };
    corsMiddleware.isBuiltin = true;
    corsMiddleware.pluginName = 'Cors';

    return corsMiddleware;
}
