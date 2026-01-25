
import { describe, expect, test } from "bun:test";
import { Shokupan } from "../../index"; // Assuming relative path adjustment
import { Cors } from "./cors";

describe("Cors Plugin", () => {
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
});
