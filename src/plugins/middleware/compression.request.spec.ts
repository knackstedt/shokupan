import { describe, expect, test } from "bun:test";
import * as zlib from "node:zlib";
import { Compression } from "../../plugins/middleware/compression";
import { Shokupan } from "../../shokupan";

async function getErrorBody(res: Response) {
    if (res.status !== 200) {
        try {
            return await res.text();
        } catch {
            return "Could not read error body";
        }
    }
    return "";
}

describe("Compression Plugin - Request Decompression", () => {
    test("should decompress gzip request body", async () => {
        const app = new Shokupan({ port: 0 });
        app.use(Compression());

        app.post("/echo", async (ctx) => {
            // Read stream to text explicitly
            // ctx.body() calls req.text() which returns our decompressed stream
            const bodyStream = await ctx.body();
            // Read the stream helper
            const text = await new Response(bodyStream).text();
            return ctx.text(text);
        });

        const server = await app.listen(0);
        const original = "Hello World".repeat(100);
        const compressed = zlib.gzipSync(original);

        const res = await fetch(`http://localhost:${server.port}/echo`, {
            method: "POST",
            headers: {
                "Content-Encoding": "gzip",
                "Content-Type": "text/plain"
            },
            body: compressed
        });

        server.stop();
        const error = await getErrorBody(res);
        if (res.status !== 200) console.error("Gzip Error:", error);

        expect(res.status).toBe(200);
        expect(await res.text()).toBe(original);
    });

    test("should decompress deflate request body", async () => {
        const app = new Shokupan({ port: 0 });
        app.use(Compression());

        app.post("/echo", async (ctx) => {
            const bodyStream = await ctx.body();
            const text = await new Response(bodyStream).text();
            return ctx.text(text);
        });

        const server = await app.listen(0);
        const original = "Deflate This".repeat(100);
        const compressed = zlib.deflateSync(original);

        const res = await fetch(`http://localhost:${server.port}/echo`, {
            method: "POST",
            headers: {
                "Content-Encoding": "deflate",
                "Content-Type": "text/plain"
            },
            body: compressed
        });

        server.stop();
        const error = await getErrorBody(res);
        if (res.status !== 200) console.error("Deflate Error:", error);

        expect(res.status).toBe(200);
        expect(await res.text()).toBe(original);
    });

    test("should decompress brotli request body", async () => {
        const app = new Shokupan({ port: 0 });
        app.use(Compression());

        app.post("/echo", async (ctx) => {
            const bodyStream = await ctx.body();
            const text = await new Response(bodyStream).text();
            return ctx.text(text);
        });

        const server = await app.listen(0);
        const original = "Brotli This".repeat(100);
        const compressed = zlib.brotliCompressSync(original);

        const res = await fetch(`http://localhost:${server.port}/echo`, {
            method: "POST",
            headers: {
                "Content-Encoding": "br",
                "Content-Type": "text/plain"
            },
            body: compressed
        });

        server.stop();
        const error = await getErrorBody(res);
        if (res.status !== 200) console.error("Brotli Error:", error);

        expect(res.status).toBe(200);
        expect(await res.text()).toBe(original);
    });

    test("should enforce maxDecompressedSize (zipbomb protection)", async () => {
        const app = new Shokupan({ port: 0 });
        // Set small limit: 100 bytes
        app.use(Compression({ maxDecompressedSize: 100 }));

        app.post("/echo", async (ctx) => {
            try {
                // accessing body triggers the stream consumption
                const bodyStream = await ctx.body();
                await new Response(bodyStream).text();
                return ctx.text("ok");
            } catch (err: any) {
                return ctx.status(413);
            }
        });

        const server = await app.listen(0);
        // Payload > 100 bytes
        const original = "A".repeat(200);
        const compressed = zlib.gzipSync(original);

        const res = await fetch(`http://localhost:${server.port}/echo`, {
            method: "POST",
            headers: {
                "Content-Encoding": "gzip",
                "Content-Type": "text/plain"
            },
            body: compressed
        });

        server.stop();

        // We expect failure. 
        // If caught: 413. 
        // If not caught (stream error in middleware): 500.
        // Both are acceptable 'protection' vs 200.
        if (res.status === 200) {
            console.error("Zipbomb succeeded unexpectedly:", await res.text());
        }

        expect(res.status).not.toBe(200);
        if (res.status === 413) {
            // Perfect
        } else if (res.status === 500) {
            // Also acceptable but check error message if needed
            // console.error(await res.text());
        }
    });

    test("should ignore identity encoding", async () => {
        const app = new Shokupan({ port: 0 });
        app.use(Compression());

        app.post("/echo", async (ctx) => {
            // For string body
            const body = await ctx.body();
            const text = typeof body === 'string' ? body : await new Response(body).text();
            return ctx.text(text);
        });

        const server = await app.listen(0);
        const original = "Plain Text";

        const res = await fetch(`http://localhost:${server.port}/echo`, {
            method: "POST",
            headers: {
                "Content-Encoding": "identity",
                "Content-Type": "text/plain"
            },
            body: original
        });

        server.stop();
        const error = await getErrorBody(res);
        if (res.status !== 200) console.error("Identity Error:", error);

        expect(res.status).toBe(200);
        expect(await res.text()).toBe(original);
    });
});
