import type { ShokupanContext } from "../../context";
import type { Middleware, NextFn } from "../../util/types";

export interface RateLimitOptions {
    /**
     * Window in milliseconds
     */
    windowMs?: number;
    /**
     * Maximum number of requests allowed in the window
     */
    max?: number;
    /**
     * Alias for max
     */
    limit?: number;
    /**
     * Message to send when rate limited
     */
    message?: string | object | ((ctx: ShokupanContext, key: string) => string | object);
    /**
     * Status code to send when rate limited
     */
    statusCode?: number;
    /**
     * Whether to include X-RateLimit headers in the response
     */
    headers?: boolean;
    /**
     * Function to generate a unique key for each request
     * This is used to identify the user or source of the request
     * Defaults to the request's ip address.
     */
    keyGenerator?: (ctx: ShokupanContext) => string;
    /**
     * Function to execute when a request is rate limited
     */
    onRateLimited?: (ctx: ShokupanContext, key: string) => void | Response | Promise<void | Response>;
    /**
     * Function to determine whether to skip rate limiting
     */
    skip?: (ctx: ShokupanContext) => boolean;
    /**
     * Mode to use for rate limiting
     * - user: Rate limit per user (generated key, defaults to ip address)
     * - absolute: Rate limit for all users
     */
    mode?: 'user' | 'absolute';
    /**
     * List of trusted proxy IPs
     */
    trustedProxies?: string[];
    /**
     * Interval in milliseconds to clean up expired entries.
     * Defaults to windowMs.
     */
    cleanupInterval?: number;
}

interface HitRecord {
    hits: number;
    resetTime: number;
}

/**
 * Rate limit middleware.
 * @param options Rate limit options
 * @returns Middleware function
 */
export function RateLimitMiddleware(options: RateLimitOptions = {}): Middleware {
    const windowMs = options.windowMs || 60 * 1000; // 1 minute
    const max = options.limit || options.max || 100; // 100 requests per window
    const message = options.message || "Too many requests, please try again later.";
    const statusCode = options.statusCode || 429;
    const headers = options.headers !== false;
    const mode = options.mode || 'user';
    const trustedProxies = options.trustedProxies || [];
    const cleanupInterval = options.cleanupInterval || windowMs;

    const keyGenerator = options.keyGenerator || ((ctx) => {
        if (mode === 'absolute') {
            return 'global';
        }

        // Security: Use proper IP detection with trusted proxy support
        const xForwardedFor = ctx.headers.get("x-forwarded-for");

        if (xForwardedFor && trustedProxies.length > 0) {
            // Parse X-Forwarded-For from right to left (most recent proxy first)
            const ips = xForwardedFor.split(',').map(ip => ip.trim());

            // Get the rightmost IP that is not in trusted proxies
            for (let i = ips.length - 1; i >= 0; i--) {
                const ip = ips[i];
                if (!trustedProxies.includes(ip)) {
                    // Validate IP format (basic check)
                    if (/^[\d.:a-fA-F]+$/.test(ip)) {
                        return ip;
                    }
                }
            }
        }

        // Fallback to server IP detection
        return (ctx.server as any)?.requestIP?.(ctx.request)?.address || "unknown";
    });
    const skip = options.skip || (() => false);

    // In-memory store
    const hits = new Map<string, HitRecord>();

    // Cleanup interval
    const interval = setInterval(() => {
        const now = Date.now();
        for (const [key, record] of hits) {
            if (record.resetTime <= now) {
                hits.delete(key);
            }
        }
    }, cleanupInterval);

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

            if (options.onRateLimited) {
                const result = await options.onRateLimited(ctx, key);
                if (result instanceof Response) {
                    return result;
                }
            }

            // Dispatch 429
            const msg = typeof message === 'function' ? message(ctx, key) : message;
            const res = await (typeof msg === 'object' ? ctx.json(msg, statusCode) : ctx.text(String(msg), statusCode));

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
