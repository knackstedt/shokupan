import type { ShokupanContext } from "../../context";
import type { Middleware, NextFn } from "../../util/types";

export interface SecurityHeadersOptions {
    /**
     * Content Security Policy
     */
    contentSecurityPolicy?: boolean | Record<string, any>;
    /**
     * Cross-Origin Embedder Policy
     */
    crossOriginEmbedderPolicy?: boolean;
    /**
     * Cross-Origin Opener Policy
     */
    crossOriginOpenerPolicy?: boolean;
    /**
     * Cross-Origin Resource Policy
     */
    crossOriginResourcePolicy?: boolean;
    /**
     * DNS Prefetch Control
     */
    dnsPrefetchControl?: boolean | { allow: boolean; };
    /**
     * Expect CT
     */
    expectCt?: boolean | { maxAge?: number, enforce?: boolean, reportUri?: string; };
    /**
     * Frameguard
     */
    frameguard?: boolean | { action: 'deny' | 'sameorigin' | 'allow-from', domain?: string; };
    /**
     * Hide Powered By
     */
    hidePoweredBy?: boolean;
    /**
     * HTTP Strict Transport Security
     */
    hsts?: boolean | { maxAge?: number, includeSubDomains?: boolean, preload?: boolean; };
    /**
     * IE No Open
     */
    ieNoOpen?: boolean;
    /**
     * No Sniff
     */
    noSniff?: boolean;
    /**
     * Origin Agent Cluster
     */
    originAgentCluster?: boolean;
    /**
     * Permitted Cross Domain Policies
     */
    permittedCrossDomainPolicies?: boolean | { permittedPolicies: 'none' | 'master-only' | 'by-content-type' | 'all'; };
    /**
     * Referrer Policy
     */
    referrerPolicy?: boolean | { policy: string | string[]; };
    /**
     * X-XSS-Protection
     */
    xssFilter?: boolean;
}

/**
 * Security headers middleware.
 * @param options Security headers options
 * @returns Middleware function
 */
export function SecurityHeaders(options: SecurityHeadersOptions = {}): Middleware {
    const securityHeadersMiddleware: Middleware = async function SecurityHeadersMiddleware(ctx: ShokupanContext, next: NextFn) {
        // Run the downstream handler first so we have a real Response to attach headers to.
        const response = await next();

        const set = (k: string, v: string) => {
            if (response instanceof Response) {
                try { response.headers.set(k, v); } catch (e) { }
            }
            ctx.response.headers.set(k, v);
        };

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
            // 'allow-from' is deprecated/obsolete in modern browsers
        }

        // Strict-Transport-Security
        // Security: Only set HSTS on secure (HTTPS) connections. Browsers ignore HSTS
        // sent over plain HTTP, and some proxies may misbehave.
        if (options.hsts !== false && ctx.secure === true) {
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

        // X-XSS-Protection — modern recommendation is '0' to avoid browser quirks
        if (options.xssFilter !== false) {
            set('X-XSS-Protection', '0');
        }

        // Referrer-Policy
        if (options.referrerPolicy !== false) {
            const opt = options.referrerPolicy as any || {};
            const policy = opt.policy || 'no-referrer';
            set('Referrer-Policy', Array.isArray(policy) ? policy.join(',') : policy);
        }

        // Content-Security-Policy
        if (options.contentSecurityPolicy !== false) {
            const opt = options.contentSecurityPolicy;
            if (opt === undefined || opt === true) {
                set('Content-Security-Policy', "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests");
            } else if (typeof opt === 'object') {
                // Build CSP string from a directives object.
                // Keys are camelCase directive names (e.g. defaultSrc) or kebab-case strings.
                // Values are strings, arrays of strings, or booleans (true = bare directive, false = omit).
                const parts: string[] = [];
                for (const [key, val] of Object.entries(opt)) {
                    if (val === false) continue;
                    // Convert camelCase to kebab-case
                    const directive = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                    if (val === true) {
                        parts.push(directive);
                    } else {
                        const sources = Array.isArray(val) ? val.join(' ') : String(val);
                        parts.push(`${directive} ${sources}`);
                    }
                }
                if (parts.length > 0) {
                    set('Content-Security-Policy', parts.join(';'));
                }
            }
        }

        // X-Powered-By suppression (Shokupan doesn't set it, but remove it if a dep added it)
        if (options.hidePoweredBy !== false) {
            if (response instanceof Response) {
                try { response.headers.delete('X-Powered-By'); } catch (e) { }
            }
            ctx.response.headers.delete('X-Powered-By');
        }

        return response;
    };
    securityHeadersMiddleware.isBuiltin = true;
    securityHeadersMiddleware.pluginName = 'SecurityHeaders';
    return securityHeadersMiddleware;
}
