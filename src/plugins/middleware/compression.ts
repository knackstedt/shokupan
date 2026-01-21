import { Readable } from 'node:stream';
import * as zlib from "node:zlib";
import type { ShokupanContext } from "../../context";
import { $finalResponse, $rawBody } from '../../util/symbol';
import type { Middleware, NextFn } from "../../util/types";

export interface CompressionOptions {
    /**
     * Minimum byte size to compress responses
     */
    threshold?: number;
    /**
     * Allowed algorithms for response compression
     */
    allowedAlgorithms?: string[];
    /**
     * Enable request decompression
     * @default true
     */
    decompress?: boolean;
    /**
     * Maximum size of decompressed request body in bytes to prevent zipbomb style attacks
     * @default 10485760 (10MB)
     */
    maxDecompressedSize?: number;
}

/**
 * Create a transform stream that enforces a size limit
 */
function createLimitStream(maxSize: number) {
    let size = 0;
    return new TransformStream({
        transform(chunk, controller) {
            size += (chunk.byteLength || chunk.length);
            if (size > maxSize) {
                controller.error(new Error(`Decompressed body size exceeded limit of ${maxSize} bytes`));
            } else {
                controller.enqueue(chunk);
            }
        }
    });
}

/**
 * Compression middleware.
 * @param options Compression options
 * @returns Middleware function
 */
export function Compression(options: CompressionOptions = {}): Middleware {
    const threshold = options.threshold ?? 512; // 512 bytes default
    const allowedAlgorithms = new Set(options.allowedAlgorithms ?? ['br', 'gzip', 'zstd', 'deflate']);
    const decompress = options.decompress ?? true;
    const maxDecompressedSize = options.maxDecompressedSize ?? 10 * 1024 * 1024; // 10MB default

    const compressionMiddleware: Middleware = async function CompressionMiddleware(ctx: ShokupanContext, next: NextFn) {
        // --- Request Decompression Logic ---
        const requestEncoding = ctx.headers.get("content-encoding");
        if (decompress && requestEncoding && !ctx.headers.get("content-encoding")?.includes("identity") && ctx.req.body) {
            let stream: ReadableStream | null = null;

            // Determine decompression method
            if (requestEncoding.includes("br")) {
                const decompressor = zlib.createBrotliDecompress();
                const nodeStream = Readable.fromWeb(ctx.req.body as any);
                stream = Readable.toWeb(nodeStream.pipe(decompressor)) as unknown as ReadableStream;
            } else if (requestEncoding.includes("gzip")) {
                if (typeof DecompressionStream !== 'undefined') {
                    stream = ctx.req.body.pipeThrough(new DecompressionStream("gzip"));
                } else {
                    const decompressor = zlib.createGunzip();
                    const nodeStream = Readable.fromWeb(ctx.req.body as any);
                    stream = Readable.toWeb(nodeStream.pipe(decompressor)) as unknown as ReadableStream;
                }
            } else if (requestEncoding.includes("deflate")) {
                if (typeof DecompressionStream !== 'undefined') {
                    stream = ctx.req.body.pipeThrough(new DecompressionStream("deflate"));
                } else {
                    const decompressor = zlib.createInflate();
                    const nodeStream = Readable.fromWeb(ctx.req.body as any);
                    stream = Readable.toWeb(nodeStream.pipe(decompressor)) as unknown as ReadableStream;
                }
            }

            if (stream) {
                // Apply zipbomb protection
                const outputStream = stream.pipeThrough(createLimitStream(maxDecompressedSize));

                // Cache IP before swapping request, as requestIP might rely on the original native request identity
                const originalIp = ctx.ip;
                const originalReq = ctx.req;

                const newHeaders = new Headers(originalReq.headers);
                newHeaders.delete("content-encoding");
                newHeaders.delete("content-length");

                const newReq = new Proxy(originalReq, {
                    get(target, prop, receiver) {
                        if (prop === 'body') return outputStream;
                        if (prop === 'headers') return newHeaders;
                        if (prop === 'json') return async () => JSON.parse(await new Response(outputStream).text());
                        if (prop === 'text') return async () => await new Response(outputStream).text();
                        if (prop === 'arrayBuffer') return async () => await new Response(outputStream).arrayBuffer();
                        if (prop === 'blob') return async () => await new Response(outputStream).blob();
                        if (prop === 'formData') return async () => await new Response(outputStream).formData();

                        // Use target as receiver to ensure native getters work (they check 'this')
                        return Reflect.get(target, prop, target);
                    }
                });

                // Force update request on context
                (ctx as any).request = newReq;

                // Restore IP via property override
                if (originalIp) {
                    Object.defineProperty(ctx, 'ip', {
                        configurable: true,
                        get: () => originalIp
                    });
                }
            }
        }

        // --- Response Compression Logic ---

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
