import { describe, expect, test } from "bun:test";
import { RateLimitMiddleware } from "../../plugins/middleware/rate-limit";
import { Shokupan } from "../../shokupan";

describe("Rate Limit Key Generator", () => {
    test("Custom keyGenerator", async () => {
        const app = new Shokupan();

        let generatedKey = "";

        app.use(RateLimitMiddleware({
            limit: 1,
            windowMs: 1000,
            keyGenerator: (ctx) => {
                generatedKey = "custom-key";
                return "custom-key";
            }
        }));

        app.get("/", (ctx) => ctx.text("ok"));

        // 1 - OK
        let res = await app.testRequest({ method: "GET", url: "/" });
        expect(res.status).toBe(200);
        expect(generatedKey).toBe("custom-key");

        // 2 - Blocked (since limit is 1)
        res = await app.testRequest({ method: "GET", url: "/" });
        expect(res.status).toBe(429);
        expect(generatedKey).toBe("custom-key");
    });
});
