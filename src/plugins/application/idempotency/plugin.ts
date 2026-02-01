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

        try {
            const stored = await ctx.app.db.get<StoredResponse>('idempotency', key);
            if (stored) {
                const responseHeaders = new Headers(stored.headers);
                responseHeaders.set('X-Idempotency-Hit', 'true');

                return new Response(stored.body, {
                    status: stored.status,
                    headers: responseHeaders
                });
            }
        } catch (e) {
            console.error("Idempotency read error:", e);
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
                await ctx.app.db.upsert('idempotency', key, toStore);
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
