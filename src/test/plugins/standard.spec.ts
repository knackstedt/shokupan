import { describe, expect, test } from "bun:test";
import { Compression } from "../../plugins/middleware/compression";
import { Cors } from "../../plugins/middleware/cors";
import { RateLimitMiddleware } from "../../plugins/middleware/rate-limit";
import { SecurityHeaders } from "../../plugins/middleware/security-headers";
import { Shokupan } from "../../shokupan";

describe("Plugins", () => {
    test("CORS", async () => {
        const app = new Shokupan();
        app.use(Cors({
            origin: "http://example.com",
            methods: "GET,POST"
        }));

        app.get("/", (ctx) => ctx.text("ok"));

        // Preflight
        let res = await app.testRequest({
            method: "OPTIONS",
            url: "http://localhost/",
            headers: {
                "Origin": "http://example.com",
                "Access-Control-Request-Method": "GET"
            }
        });

        expect(res.status).toBe(204);
        expect(res.headers["access-control-allow-origin"]).toBe("http://example.com");
        expect(res.headers["access-control-allow-methods"]).toBe("GET,POST");

        // Actual Request
        res = await app.testRequest({
            method: "GET",
            url: "http://localhost/",
            headers: { "Origin": "http://example.com" }
        });

        expect(res.status).toBe(200);
        expect(res.headers["access-control-allow-origin"]).toBe("http://example.com");
    });

    test("SecurityHeaders", async () => {
        const app = new Shokupan();
        app.use(SecurityHeaders());

        app.get("/", (ctx) => ctx.text("ok"));

        const res = await app.testRequest({ method: "GET", url: "http://localhost/" });

        expect(res.headers["x-dns-prefetch-control"]).toBe("off");
        expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
        expect(res.headers["strict-transport-security"]).toContain("max-age=");
        expect(res.headers["x-download-options"]).toBe("noopen");
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["x-xss-protection"]).toBe("0");
    });

    test("Rate Limit", async () => {
        const app = new Shokupan();
        app.use(RateLimitMiddleware({
            windowMs: 1000,
            max: 2
        }));


        app.get("/", (ctx) => ctx.text("ok"));

        // 1st
        let res = await app.testRequest({
            method: "GET",
            url: "http://localhost/",
            headers: { "x-forwarded-for": "1.2.3.4" }
        });
        expect(res.status).toBe(200);
        expect(res.headers["x-ratelimit-remaining"]).toBe("1");

        // 2nd
        res = await app.testRequest({
            method: "GET",
            url: "http://localhost/",
            headers: { "x-forwarded-for": "1.2.3.4" }
        });
        expect(res.status).toBe(200);
        expect(res.headers["x-ratelimit-remaining"]).toBe("0");

        // 3rd (Blocked)
        res = await app.testRequest({
            method: "GET",
            url: "http://localhost/",
            headers: { "x-forwarded-for": "1.2.3.4" }
        });
        expect(res.status).toBe(429);
        expect(res.headers["x-ratelimit-remaining"]).toBe("0");
    });

    test("Compression", async () => {
        const app = new Shokupan();
        app.use(Compression({ threshold: 0 })); // Compress everything

        app.get("/", (ctx) => ctx.text("hello world"));

        // Without Accept-Encoding
        let res = await app.testRequest({ method: "GET", url: "http://localhost/" });
        expect(res.headers["content-encoding"]).toBeUndefined();
        expect(res.data).toBe("hello world");

        // With Accept-Encoding: gzip
        // processRequest returns processed data, but for compression we need to inspect low-level response ideally.
        // processRequest reads body as text/json.
        // If content-encoding is set, processRequest usually decodes it automatically if using native fetch client, 
        // OR returns the raw buffer if we didn't decode.
        // In Shokupan `processRequest`:
        // It calls `fetch`, then reads `res.json()` or `res.text()`.
        // Native Response.text() transparently decompresses if headers are standard? 
        // Actually, Bun/Node's Response logic handles decompression if content-encoding is gzip.
        // So `res.data` will be "hello world". 
        // We check headers to verify compression happened.

        // With Accept-Encoding: gzip
        // Need to use app.fetch directly to get the Response object and read as arrayBuffer
        const req = new Request("http://localhost/", {
            method: "GET",
            headers: { "accept-encoding": "gzip" }
        });

        const rawRes = await app.fetch(req);

        expect(rawRes.headers.get("content-encoding")).toBe("gzip");

        const buffer = await rawRes.arrayBuffer();
        const decompressed = Bun.gunzipSync(new Uint8Array(buffer));
        expect(new TextDecoder().decode(decompressed)).toBe("hello world");
    });

    test("Compression (Brotli)", async () => {
        const app = new Shokupan();
        app.use(Compression({ threshold: 0 }));

        app.get("/", (ctx) => ctx.text("hello brotli"));

        const req = new Request("http://localhost/", {
            method: "GET",
            headers: { "accept-encoding": "br" }
        });

        const rawRes = await app.fetch(req);

        expect(rawRes.headers.get("content-encoding")).toBe("br");

        const buffer = await rawRes.arrayBuffer();
        const decompressed = require("node:zlib").brotliDecompressSync(buffer);
        expect(new TextDecoder().decode(decompressed)).toBe("hello brotli");
    });
});
