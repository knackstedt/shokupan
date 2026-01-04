import type { ShokupanContext } from "../context";
import type { Middleware, NextFn } from "../types";

export interface RateLimitOptions {
    windowMs?: number;
    max?: number;
    limit?: number; // Alias for max
    message?: string | object;
    statusCode?: number;
    headers?: boolean;
    keyGenerator?: (ctx: ShokupanContext) => string;
    skip?: (ctx: ShokupanContext) => boolean;
    mode?: 'user' | 'absolute';
}

interface HitRecord {
    hits: number;
    resetTime: number;
}

export function RateLimitMiddleware(options: RateLimitOptions = {}): Middleware {
    const windowMs = options.windowMs || 60 * 1000; // 1 minute
    const max = options.limit || options.max || 5; // 5 requests per window
    const message = options.message || "Too many requests, please try again later.";
    const statusCode = options.statusCode || 429;
    const headers = options.headers !== false;
    const mode = options.mode || 'user';

    const keyGenerator = options.keyGenerator || ((ctx) => {
        if (mode === 'absolute') {
            return 'global';
        }
        // Use IP if available
        return ctx.headers.get("x-forwarded-for")
            || ctx.request.headers.get("x-forwarded-for")
            || (ctx.server as any)?.requestIP?.(ctx.request)?.address
            || "unknown";
    });
    const skip = options.skip || (() => false);

    // In-memory store
    const hits = new Map<string, HitRecord>();

    // Cleanup interval
    const interval = setInterval(() => {
        const now = Date.now();
        const entries = Array.from(hits.entries());
        for (let i = 0; i < entries.length; i++) {
            const [key, record] = entries[i];
            if (record.resetTime <= now) {
                hits.delete(key);
            }
        }
    }, windowMs);

    // Ensure interval doesn't block process exit
    if (interval.unref) interval.unref();

    const rateLimitMiddleware: Middleware = async function RateLimitMiddleware(ctx: ShokupanContext, next: NextFn) {
        if (skip(ctx)) return next();

        const key = keyGenerator(ctx);
        const now = Date.now();
        let record = hits.get(key);

        // Initialize record if not exists or expired
        if (!record || record.resetTime <= now) {
            record = {
                hits: 0,
                resetTime: now + windowMs
            };
            hits.set(key, record);
        }

        record.hits++;

        const remaining = Math.max(0, max - record.hits);
        const resetTime = Math.ceil(record.resetTime / 1000); // Epoch seconds
        const retryAfter = Math.ceil((record.resetTime - now) / 1000); // Seconds until reset

        // Helper to set headers
        const setHeaders = (res: Response | any) => {
            if (!headers || !res || !res.headers) return;
            try {
                res.headers.set("X-RateLimit-Limit", String(max));
                res.headers.set("X-RateLimit-Remaining", String(remaining));
                res.headers.set("X-RateLimit-Reset", String(resetTime));
            } catch (e) { /* ignore */ }
        };

        if (record.hits > max) {

            // Dispatch 429
            const body = typeof message === 'object' ? JSON.stringify(message) : String(message);
            const res = typeof message === 'object' ? ctx.json(message, statusCode) : ctx.text(String(message), statusCode);

            if (headers) {
                setHeaders(res);
                res.headers.set("Retry-After", String(retryAfter));
            }

            return res;
        }

        const response = await next();

        // If response is a Response object, attach headers
        if (response instanceof Response && headers) {
            setHeaders(response);
        }

        return response;
    };

    rateLimitMiddleware.isBuiltin = true;
    rateLimitMiddleware.pluginName = 'RateLimit';

    return rateLimitMiddleware;
}
