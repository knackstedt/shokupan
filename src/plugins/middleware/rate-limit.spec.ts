
import { describe, expect, test } from "bun:test";
import { Shokupan } from "../../index";
import { RateLimitMiddleware } from "./rate-limit";

describe("RateLimit Plugin", () => {
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
});
