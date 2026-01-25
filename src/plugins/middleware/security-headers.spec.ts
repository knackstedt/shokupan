
import { describe, expect, test } from "bun:test";
import { Shokupan } from "../../index";
import { SecurityHeaders } from "./security-headers";

describe("SecurityHeaders Plugin", () => {
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
});
