import type { ShokupanContext } from "../context";
import type { Middleware, NextFn } from "../types";

export interface CompressionOptions {
    threshold?: number; // Minimum byte size to compress
}

export function Compression(options: CompressionOptions = {}): Middleware {
    const threshold = options.threshold ?? 1024; // 1KB default

    return async (ctx: ShokupanContext, next: NextFn) => {
        const acceptEncoding = ctx.headers.get("accept-encoding") || "";

        // Check if compression is supported
        let method: 'br' | 'gzip' | 'deflate' | null = null;
        if (acceptEncoding.includes("br")) method = "br";
        else if (acceptEncoding.includes("gzip")) method = "gzip";
        else if (acceptEncoding.includes("deflate")) method = "deflate";

        if (!method) return next();

        const response = await next();

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
                return new Response(body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers
                });
            }

            let compressed: Uint8Array;
            if (method === "br") {
                // Configurable params could be added later
                compressed = require("node:zlib").brotliCompressSync(body);
            } else if (method === "gzip") {
                compressed = Bun.gzipSync(body);
            } else {
                compressed = Bun.deflateSync(body);
            }

            const headers = new Headers(response.headers);
            headers.set("Content-Encoding", method);
            headers.set("Content-Length", String(compressed.length));
            headers.delete("Content-Length"); // Remove original length if present

            return new Response(compressed, {
                status: response.status,
                statusText: response.statusText,
                headers
            });
        }

        return response;
    };
}
