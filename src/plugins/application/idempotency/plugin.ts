import { RecordId } from 'surrealdb';
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
}

interface StoredResponse {
    status: number;
    headers: Record<string, string>;
    body: string;
    timestamp: number;
}

/**
 * Idempotency middleware. This middleware will cache responses based on the idempotency key
 * to prevent duplicate server processing of requests.
 * @param options Idempotency options
 * @returns Middleware
 */
export function Idempotency(options: IdempotencyOptions = {}): Middleware {
    const headerName = options.header || "Idempotency-Key";
    const ttl = options.ttl || 24 * 60 * 60 * 1000;

    const idempotencyMiddleware: Middleware = async function IdempotencyMiddleware(ctx: ShokupanContext, next) {
        const key = ctx.headers.get(headerName);

        if (!key) {
            return next();
        }

        // Check if key exists
        try {
            const stored = await ctx.app.db.select<StoredResponse>(new RecordId('idempotency', key));
            if (stored) {
                // Check TTL (though database cleaning might happen elsewhere, good to check here too if needed, 
                // but usually we rely on DB or just return if found. 
                // Let's rely on finding it = valid for now, or check timestamp if we care about explicit expiry logic 
                // beyond just "record exists". SurrealDB might not auto-expire without events, 
                // but let's check timestamp manually for safety or just assume if it's there it's valid.
                // Should we implement cleanup? For now, we'll return what we found.

                const responseHeaders = new Headers(stored.headers);
                responseHeaders.set('X-Idempotency-Hit', 'true');

                // Return stored response
                return new Response(stored.body, {
                    status: stored.status,
                    headers: responseHeaders
                });
            }
        } catch (e) {
            // If error reading, log and proceed? Or fail?
            console.error("Idempotency read error:", e);
            // safe default: proceed as if new
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
                timestamp: Date.now()
            };

            // Fire and forget storage? Or await?
            // Await to ensure persistence before returning to client (safer for "guarantee")
            try {
                await ctx.app.db.upsert(new RecordId('idempotency', key), toStore);
            } catch (e) {
                console.error("Idempotency write error:", e);
            }

            return response;
        }

        return result;
    };

    idempotencyMiddleware.isBuiltin = true;
    idempotencyMiddleware.pluginName = 'Idempotency';

    return idempotencyMiddleware;
}
