import * as zlib from "node:zlib";
import type { ShokupanContext } from "../../context";
import { $finalResponse, $rawBody } from '../../util/symbol';
import type { Middleware, NextFn } from "../../util/types";

export interface CompressionOptions {
    /**
     * Minimum byte size to compress
     */
    threshold?: number;
    /**
     * Allowed algorithms
     */
    allowedAlgorithms?: string[];
}

/**
 * Compression middleware.
 * @param options Compression options
 * @returns Middleware function
 */
export function Compression(options: CompressionOptions = {}): Middleware {
    const threshold = options.threshold ?? 512; // 512 bytes default
    const allowedAlgorithms = new Set(options.allowedAlgorithms ?? ['br', 'gzip', 'zstd', 'deflate']);

    const compressionMiddleware: Middleware = async function CompressionMiddleware(ctx: ShokupanContext, next: NextFn) {
        const acceptEncoding = ctx.headers.get("accept-encoding") || "";

        // Check if compression is supported
        let method: 'br' | 'gzip' | 'zstd' | 'deflate' | null = null;
        if (acceptEncoding.includes("br")) method = "br";
        else if (acceptEncoding.includes("zstd")) {
            // Validate zstd is only used in Bun runtime
            if (typeof Bun === 'undefined') {
                throw new Error("zstd compression is only available in Bun runtime. Client requested zstd but server is running on Node.js.");
            }
            method = "zstd";
        }
        else if (acceptEncoding.includes("gzip")) method = "gzip";
        else if (acceptEncoding.includes("deflate")) method = "deflate";

        if (!method) return next();

        if (!allowedAlgorithms.has(method)) {
            return next();
        }

        let response = await next();

        // Check for implicit return stored in context
        if (!(response instanceof Response) && ctx[$finalResponse] instanceof Response) {
            response = ctx[$finalResponse];
        }

        if (response instanceof Response) {
            // Don't compress if already compressed
            if (response.headers.has("Content-Encoding")) return response;

            // Optimized path: use raw body from context if available
            // Optimized path: use raw body from context if available
            let body: ArrayBuffer | Uint8Array;
            let bodySize: number;

            if (ctx[$rawBody] !== undefined) {
                // Fast path: we have the raw body from ctx.json() or ctx.text()
                if (typeof ctx[$rawBody] === "string") {
                    const encoded = new TextEncoder().encode(ctx[$rawBody]);
                    body = encoded;
                    bodySize = encoded.byteLength;
                } else if (ctx[$rawBody] instanceof Uint8Array) {
                    body = ctx[$rawBody];
                    bodySize = ctx[$rawBody].byteLength;
                } else {
                    body = ctx[$rawBody] as ArrayBuffer;
                    bodySize = body.byteLength;
                }
            } else {
                // Fallback: read from response (slower)
                body = await response.arrayBuffer();
                bodySize = body.byteLength;
            }

            if (bodySize < threshold) {
                // Don't compress, but we consumed the body so recreate the response
                return new Response(body as any, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: new Headers(response.headers)
                });
            }

            let compressed: Uint8Array;

            switch (method) {
                case "br":
                    compressed = await new Promise((res, rej) => zlib.brotliCompress(body, {
                        params: {
                            [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
                        }
                    }, (err, data) => {
                        if (err) return rej(err);
                        res(data);
                    }));
                    break;
                case "gzip":
                    compressed = await new Promise((res, rej) => zlib.gzip(body, (err, data) => {
                        if (err) return rej(err);
                        res(data);
                    }));
                    break;
                case "zstd":
                    // Note: Runtime check happens earlier in method selection
                    compressed = await Bun.zstdCompress(body);
                    break;
                default: // deflate
                    compressed = await new Promise((res, rej) => zlib.deflate(body, (err, data) => {
                        if (err) return rej(err);
                        res(data);
                    }));
                    break;
            }

            const headers = new Headers(response.headers);
            headers.set("Content-Encoding", method);
            headers.set("Content-Length", String(compressed.length));

            return new Response(compressed as any, {
                status: response.status,
                statusText: response.statusText,
                headers
            });
        }

        return response;
    };

    compressionMiddleware.isBuiltin = true;
    compressionMiddleware.pluginName = 'Compression';
    return compressionMiddleware;
};
