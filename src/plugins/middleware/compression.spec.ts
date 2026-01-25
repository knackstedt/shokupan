
import { describe, expect, test } from "bun:test";
import { createRequire } from "module";
import { Shokupan } from "../../index";
import { Compression } from "./compression";
const require = createRequire(import.meta.url);

describe("Compression Plugin", () => {
    test("Compression", async () => {
        const app = new Shokupan();
        app.use(Compression({ threshold: 0 })); // Compress everything

        app.get("/", (ctx) => ctx.text("hello world"));

        // Without Accept-Encoding
        let res = await app.testRequest({ method: "GET", url: "http://localhost/" });
        expect(res.headers["content-encoding"]).toBeUndefined();
        expect(res.data).toBe("hello world");

        // With Accept-Encoding: gzip
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
