
import { describe, expect, it } from "bun:test";
import { Compression } from "../src/plugins/compression";
import { Shokupan } from "../src/shokupan";

describe("Compression Middleware - Implicit Return", () => {
    it("should compress response when handler implicit returns but calls ctx.text()", async () => {
        const app = new Shokupan();
        // app.use(Compression()); // Enabling compression to verify middleware interaction
        // Actually, just checking if app returns 200 OK is enough first step, 
        // to prove that implicit return currently fails (404).

        app.get("/implicit", (ctx) => {
            ctx.text("Implicit Hello");
            // No return
        });

        const res = await app.fetch(new Request("http://localhost/implicit"));

        // Currently this fails (returns 404), we want it to eventually pass (200)
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("Implicit Hello");
    });

    it("should work with compression middleware too", async () => {
        const app = new Shokupan();
        app.use(Compression());

        app.get("/compress-implicit", (ctx) => {
            ctx.text("A".repeat(1000));
        });

        const res = await app.fetch(new Request("http://localhost/compress-implicit", {
            headers: { "Accept-Encoding": "gzip" }
        }));

        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Encoding")).toBe("gzip");
    });
});
