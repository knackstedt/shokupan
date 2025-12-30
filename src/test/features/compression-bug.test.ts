
import { describe, expect, test } from "bun:test";
import { Compression } from "../../plugins/compression";
import { Shokupan } from "../../shokupan";

describe("Compression Plugin Bug", () => {
    test("should NOT set Content-Encoding for small responses", async () => {
        const app = new Shokupan({ port: 0 });
        app.use(Compression({ threshold: 1024 }));

        app.get("/small", (ctx) => {
            ctx.text("123");
        });

        const server = await app.listen(0);
        const port = server.port;

        const res = await fetch(`http://localhost:${port}/small`, {
            headers: { "Accept-Encoding": "gzip" }
        });

        server.stop();

        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Encoding")).toBeNull();
        const text = await res.text();
        expect(text).toBe("123");
    });
});
