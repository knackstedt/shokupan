import type { ShokupanContext } from "../context";
import type { Middleware, NextFn } from "../types";

export interface CompressionOptions {
    threshold?: number; // Minimum byte size to compress
}

export function Compression(options: CompressionOptions = {}): Middleware {
    const threshold = options.threshold ?? 512; // 1KB default

    const compressionMiddleware: Middleware = async function CompressionMiddleware(ctx: ShokupanContext, next: NextFn) {
        const acceptEncoding = ctx.headers.get("accept-encoding") || "";

        // Check if compression is supported
        let method: 'br' | 'gzip' | 'zstd' | 'deflate' | null = null;
        if (acceptEncoding.includes("br")) method = "br";
        else if (acceptEncoding.includes("zstd")) method = "zstd";
        else if (acceptEncoding.includes("gzip")) method = "gzip";
        else if (acceptEncoding.includes("deflate")) method = "deflate";

        if (!method) return next();

        let response = await next();

        // Check for implicit return stored in context
        // This handles cases where handlers use ctx.text() / ctx.json() but return void
        if (!(response instanceof Response) && ctx._finalResponse instanceof Response) {
            response = ctx._finalResponse;
        }

        if (response instanceof Response) {
            // Don't compress if already compressed
            if (response.headers.has("Content-Encoding")) return response;

            // Check Content-Type (optional, mostly text/json/xml)
            // For now, let's just compress if we can read the body easily.

            // Cloning response to read body
            // Note: This might be expensive for streams. 
            // We only support basic compression for now (string/buffer bodies).
            // If body is a ReadableStream, Bun.gzip/deflateSync won't work directly on it mostly.

            // Let's try to read as ArrayBuffer
            const body = await response.arrayBuffer();

            if (body.byteLength < threshold) {
                // Return new response with original body because we consumed it
                // Do NOT set Content-Encoding as we are not compressing
                return new Response(body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                });
            }

            let compressed: Uint8Array;
            switch (method) {
                case "br":
                    // Configurable params could be added later
                    const zlib = require("node:zlib");
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
                    compressed = Bun.gzipSync(body);
                    break;
                case "zstd":
                    compressed = await Bun.zstdCompress(body);
                    break;
                default:
                    compressed = Bun.deflateSync(body);
                    break;
            }

            const headers = new Headers(response.headers);
            headers.set("Content-Encoding", method);
            headers.set("Content-Length", String(compressed.length));

            return new Response(compressed, {
                status: response.status,
                statusText: response.statusText,
                headers
            });
        }
        else {
            // Pass through non-Response values (e.g. undefined, or raw objects)
            // The application or other middleware might handle them.
        }

        return response;
    };
    (compressionMiddleware as any).isBuiltin = true;
    (compressionMiddleware as any).pluginName = 'Compression';
    return compressionMiddleware;
};
