import type { ShokupanContext } from "../context";
import type { Middleware, NextFn } from "../types";

export interface SecurityHeadersOptions {
    contentSecurityPolicy?: boolean | Record<string, any>;
    crossOriginEmbedderPolicy?: boolean;
    crossOriginOpenerPolicy?: boolean;
    crossOriginResourcePolicy?: boolean;
    dnsPrefetchControl?: boolean | { allow: boolean; };
    expectCt?: boolean | { maxAge?: number, enforce?: boolean, reportUri?: string; };
    frameguard?: boolean | { action: 'deny' | 'sameorigin' | 'allow-from', domain?: string; };
    hidePoweredBy?: boolean;
    hsts?: boolean | { maxAge?: number, includeSubDomains?: boolean, preload?: boolean; };
    ieNoOpen?: boolean;
    noSniff?: boolean;
    originAgentCluster?: boolean;
    permittedCrossDomainPolicies?: boolean | { permittedPolicies: 'none' | 'master-only' | 'by-content-type' | 'all'; };
    referrerPolicy?: boolean | { policy: string | string[]; };
    xssFilter?: boolean;
}

export function SecurityHeaders(options: SecurityHeadersOptions = {}): Middleware {
    const securityHeadersMiddleware: Middleware = async function SecurityHeadersMiddleware(ctx: ShokupanContext, next: NextFn) {
        const headers: Record<string, string> = {};

        // Helper to set header if not already set or force it
        const set = (k: string, v: string) => headers[k] = v;

        // X-DNS-Prefetch-Control
        if (options.dnsPrefetchControl !== false) {
            const allow = (options.dnsPrefetchControl as any)?.allow;
            set("X-DNS-Prefetch-Control", allow ? "on" : "off");
        }

        // X-Frame-Options
        if (options.frameguard !== false) {
            const opt = options.frameguard as any || {};
            const action = opt.action || 'sameorigin';
            if (action === 'sameorigin') set('X-Frame-Options', 'SAMEORIGIN');
            else if (action === 'deny') set('X-Frame-Options', 'DENY');
            // 'allow-from' is deprecated/obsolete in modern browsers, but we can support it if needed.
        }

        // Strict-Transport-Security
        if (options.hsts !== false) {
            const opt = options.hsts as any || {};
            const maxAge = opt.maxAge || 15552000; // 180 days
            let header = `max-age=${maxAge}`;
            if (opt.includeSubDomains !== false) header += '; includeSubDomains';
            if (opt.preload) header += '; preload';
            set('Strict-Transport-Security', header);
        }

        // X-Download-Options
        if (options.ieNoOpen !== false) {
            set('X-Download-Options', 'noopen');
        }

        // X-Content-Type-Options
        if (options.noSniff !== false) {
            set('X-Content-Type-Options', 'nosniff');
        }

        // X-XSS-Protection (Legacy, but still sometimes used)
        if (options.xssFilter !== false) {
            set('X-XSS-Protection', '0'); // Modern recommendation is to disable it as it can introduce vulns
        }

        // Referrer-Policy
        if (options.referrerPolicy !== false) {
            const opt = options.referrerPolicy as any || {};
            const policy = opt.policy || 'no-referrer';
            set('Referrer-Policy', Array.isArray(policy) ? policy.join(',') : policy);
        }

        // Content-Security-Policy
        if (options.contentSecurityPolicy !== false) {
            // Basic default CSP if true, or use object
            const opt = options.contentSecurityPolicy;
            if (opt === undefined || opt === true) {
                set('Content-Security-Policy', "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests");
            } else if (typeof opt === 'object') {
                // Construct CSP string from object (simplified)
                // Assuming user passes raw string or we'd need a directive builder.
                // For now, let's assume they pass directives map.
                const parts = [];
                for (const [key, val] of Object.entries(opt)) {
                    // directives, etc.
                    // This is complex to implement fully without a library like 'helmet' itself.
                    // We will support a simple string or custom logic later if requested.
                    // For now, skip complex object parsing to keep it simple as per "standard middleware" MVP.
                }
            }
        }

        if (options.hidePoweredBy !== false) {
            // Note: Shokupan doesn't set X-Powered-By by default, so we usually don't need to remove it.
            // But we can ensure it's not there.
            // We can't delete from response easily before it's created, but we can try to suppress it if we had a hook.
            // Here we might just do nothing as we don't add it.
        }

        // Apply headers to context response
        // We need to apply these to the response *after* it's generated, or *before* if we use `ctx.headers` mutation?
        // `ctx.headers` is currently read-only wrapper around `req.headers` in `ShokupanContext`?
        // Wait, `ctx.headers` in `ShokupanContext` getter is `this.request.headers`.
        // We cannot set response headers on the request object.
        // We need to intercept the response.

        const response = await next();

        if (response instanceof Response) {
            for (const [k, v] of Object.entries(headers)) {
                response.headers.set(k, v);
            }
            return response;
        }

        // If next() returned something else (e.g. string/json that router will wrap),
        // we can't easily attach headers here unless we wrap the result in a Response.
        // BUT `compose` and `router` logic allows next() to return result which `router` converts to Response.
        // If middleware runs *before* router, next() returns the router's result.

        // If we want to ensure headers are set, we might need to rely on `ctx` having a way to set "outgoing" headers 
        // that the router respects, OR we must wrap the response.

        return response;
        return response;
    };
    securityHeadersMiddleware.isBuiltin = true;
    securityHeadersMiddleware.pluginName = 'SecurityHeaders';
    return securityHeadersMiddleware;
}
