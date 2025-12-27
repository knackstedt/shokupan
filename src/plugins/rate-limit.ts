import type { ShokupanContext } from "../context";
import type { Middleware, NextFn } from "../types";

export interface RateLimitOptions {
    windowMs?: number;
    max?: number;
    message?: string | object;
    statusCode?: number;
    headers?: boolean;
    keyGenerator?: (ctx: ShokupanContext) => string;
    skip?: (ctx: ShokupanContext) => boolean;
}

interface HitRecord {
    hits: number;
    resetTime: number;
}

export function RateLimit(options: RateLimitOptions = {}): Middleware {
    const windowMs = options.windowMs || 60 * 1000; // 1 minute
    const max = options.max || 5; // 5 requests per window
    const message = options.message || "Too many requests, please try again later.";
    const statusCode = options.statusCode || 429;
    const headers = options.headers !== false;
    const keyGenerator = options.keyGenerator || ((ctx) => {
        // Use IP if available (Bun specific property on server, but not exposed in generic Request easily without server context)
        // Fallback to simpler key or x-forwarded-for
        return ctx.headers.get("x-forwarded-for") || ctx.url.hostname || "unknown";
    });
    const skip = options.skip || (() => false);

    // In-memory store
    // Note: For production with multiple instances, use Redis or similar external store.
    const hits = new Map<string, HitRecord>();

    // Cleanup interval
    const interval = setInterval(() => {
        const now = Date.now();
        for (const [key, record] of hits.entries()) {
            if (record.resetTime <= now) {
                hits.delete(key);
            }
        }
    }, windowMs);
    // Ensure interval doesn't block process exit
    if (interval.unref) interval.unref();

    return async (ctx: ShokupanContext, next: NextFn) => {
        if (skip(ctx)) return next();

        const key = keyGenerator(ctx);
        const now = Date.now();
        let record = hits.get(key);

        if (!record || record.resetTime <= now) {
            record = {
                hits: 0,
                resetTime: now + windowMs
            };
            hits.set(key, record);
        }

        record.hits++;

        const remaining = Math.max(0, max - record.hits);
        const resetTime = Math.ceil(record.resetTime / 1000);

        if (headers) {
            // We need to set headers on the response. 
            // Similar to Helmet, we need to intercept the response or set it on context if supported.
            // For now, let's assume we can attach to the eventual response wrapper or helper.
            // Since we can't modify `ctx.response` directly before it exists, we wrap.
        }

        if (record.hits > max) {
            if (headers) {
                // Return immediate response
                const res = typeof message === 'object' ? ctx.json(message, statusCode) : ctx.text(String(message), statusCode);
                res.headers.set("X-RateLimit-Limit", String(max));
                res.headers.set("X-RateLimit-Remaining", "0");
                res.headers.set("X-RateLimit-Reset", String(resetTime));
                return res;
            }
            return typeof message === 'object' ? ctx.json(message, statusCode) : ctx.text(String(message), statusCode);
        }

        const response = await next();

        if (response instanceof Response && headers) {
            response.headers.set("X-RateLimit-Limit", String(max));
            response.headers.set("X-RateLimit-Remaining", String(remaining));
            response.headers.set("X-RateLimit-Reset", String(resetTime));
        }

        return response;
    };
}
