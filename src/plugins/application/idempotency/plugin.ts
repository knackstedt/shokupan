import { createHash } from "crypto";
import type { ShokupanContext } from "../../../context";
import { $finalResponse } from '../../../util/symbol';
import type { Middleware } from "../../../util/types";

export interface IdempotencyOptions {
    /**
     * Header name to use for the idempotency key.
     * @default "Idempotency-Key"
     */
    header?: string;
    /**
     * Time to live for the idempotency key in milliseconds.
     * @default 86400000 (24 hours)
     */
    ttl?: number;
    /**
     * Maximum allowed length of the idempotency key (after trimming).
     * Keys longer than this are rejected and treated as if no key was supplied.
     * @default 255
     */
    maxKeyLength?: number;
    /**
     * Function that derives an ownership scope for a request. The scope is
     * combined with the supplied idempotency key to form the datastore
     * identifier, so that a cached response stored under one owner can never
     * be served to a different owner who happens to reuse the same
     * Idempotency-Key.
     *
     * The default derives the scope from the authenticated session
     * (`ctx.sessionID`) when the Session middleware has run, and falls back to
     * the literal string `"anonymous"` for unauthenticated/public routes.
     *
     * Supply a custom function to bind the cache to a different identity
     * primitive (e.g. an API key, user id, or tenant id).
     */
    scope?: (ctx: ShokupanContext) => string;
}

interface StoredResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
    timestamp: number;
    /**
     * Ownership scope this cached response belongs to. Verified on retrieval
     * as defense-in-depth: a record whose owner does not match the current
     * request's scope is treated as a cache miss.
     */
    owner: string;
}

/**
 * Allowed characters for an idempotency key: printable ASCII (0x21-0x7E),
 * excluding spaces and control characters. Keys are opaque tokens (typically
 * UUIDs or base64url strings) and must not contain whitespace, delimiters, or
 * non-printable bytes.
 */
const KEY_PATTERN = /^[\x21-\x7E]+$/;

/**
 * Default ownership scope: the request's session id when the Session
 * middleware has populated it, otherwise a shared anonymous namespace. The
 * anonymous namespace is only safe for public, user-independent responses;
 * authenticated routes should always run the Session middleware (or supply a
 * custom `scope`) before this middleware.
 */
function defaultScope(ctx: ShokupanContext): string {
    const sid = (ctx as any).sessionID as string | undefined;
    return sid && sid.length > 0 ? sid : 'anonymous';
}

/**
 * Build a fixed-length, collision-resistant datastore identifier from an
 * ownership scope and the (normalized) idempotency key. Hashing the composite
 * prevents separator-injection and avoids datastore id length limits, while
 * binding the record to its owner so it cannot be retrieved by a different
 * owner reusing the same key.
 */
function buildStorageKey(scope: string, normalizedKey: string): string {
    const composite = `${scope}\x1f${normalizedKey}`;
    return createHash('sha256').update(composite).digest('hex');
}

/**
 * Idempotency middleware. This middleware will cache responses based on the idempotency key
 * to prevent duplicate server processing of requests.
 *
 * Security: the supplied Idempotency-Key is never used as the sole datastore
 * identifier. It is normalized, length-limited, validated, and combined with
 * an ownership scope (defaulting to the session id) before being hashed into
 * the actual record id. This prevents one user from retrieving another user's
 * cached response by replaying the same Idempotency-Key.
 * @param options Idempotency options
 * @returns Middleware
 */
export function Idempotency(options: IdempotencyOptions = {}): Middleware {
    const headerName = options.header || "Idempotency-Key";
    const ttl = options.ttl || 24 * 60 * 60 * 1000;
    const maxKeyLength = options.maxKeyLength ?? 255;
    const scopeFn = options.scope || defaultScope;

    const idempotencyMiddleware: Middleware = async function IdempotencyMiddleware(ctx: ShokupanContext, next) {
        const rawKey = ctx.headers.get(headerName);

        if (!rawKey) {
            return next();
        }

        // Normalize: trim surrounding whitespace.
        const normalizedKey = rawKey.trim();

        // Validate: reject empty, over-length, or non-printable keys. Such
        // values cannot be a legitimate opaque token and are ignored rather
        // than cached, so the request simply proceeds without idempotency.
        if (
            normalizedKey.length === 0 ||
            normalizedKey.length > maxKeyLength ||
            !KEY_PATTERN.test(normalizedKey)
        ) {
            ctx.app?.logger?.warn?.('Idempotency', 'Rejected invalid idempotency key', {
                length: normalizedKey.length
            });
            return next();
        }

        // Derive ownership scope and the scoped, hashed datastore identifier.
        const scope = scopeFn(ctx) || 'anonymous';
        const storageKey = buildStorageKey(scope, normalizedKey);

        try {
            const stored = await ctx.app!.db!.get<StoredResponse>('idempotency', storageKey);
            if (stored) {
                // Defense-in-depth: even though the storage key is scoped,
                // verify the recorded owner matches the current request's
                // scope before serving the cached response.
                if (stored.owner !== scope) {
                    ctx.app?.logger?.warn?.('Idempotency', 'Owner mismatch on cache lookup; treating as miss');
                } else {
                    const responseHeaders = new Headers(stored.headers);
                    responseHeaders.set('X-Idempotency-Hit', 'true');

                    return new Response(stored.body, {
                        status: stored.status,
                        headers: responseHeaders
                    });
                }
            }
        } catch (e) {
            ctx.app?.logger?.error('Idempotency', 'Read error', e as any);
        }


        // Not found, execute
        const result = await next();

        let response: Response | undefined;

        // Normalization logic mimicking Shokupan.handleRequest
        if (result instanceof Response) {
            response = result;
        } else if ((result === null || result === undefined) && ctx[$finalResponse] instanceof Response) {
            response = ctx[$finalResponse];
        } else if (result !== null && result !== undefined) {
            if (typeof result === 'object') {
                response = await ctx.json(result);
            } else {
                response = await ctx.text(String(result));
            }
        }

        // If response is successful (or we want to cache failures too?), store it.
        // Usually we cache 2xx, maybe 4xx.
        // Let's cache everything for strict idempotency.

        if (response instanceof Response) {
            // valid key, new response
            // We need to clone the response to read the body without consuming the original stream for the downstream
            const clone = response.clone();
            const bodyText = await clone.text();

            const headers: Record<string, string> = {};
            clone.headers.forEach((v, k) => {
                headers[k] = v;
            });

            const toStore: StoredResponse = {
                status: clone.status,
                headers,
                body: bodyText,
                timestamp: Date.now(),
                owner: scope
            };

            // Fire and forget storage? Or await?
            // Await to ensure persistence before returning to client (safer for "guarantee")
            try {
                await ctx.app!.db!.upsert('idempotency', storageKey, toStore);
            } catch (e) {
                ctx.app?.logger?.error('Idempotency', 'Write error', e as any);
            }

            return response;
        }

        return result;

    };

    idempotencyMiddleware.isBuiltin = true;
    idempotencyMiddleware.pluginName = 'Idempotency';

    return idempotencyMiddleware;
}
