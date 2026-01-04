/**
 * Test for JSON parser configuration
 * Verifies that different JSON parsers can be configured and work correctly
 */

import { describe, expect, test } from "bun:test";
import { Shokupan } from "../shokupan";

describe("JSON Parser Configuration", () => {
    test("should use native JSON parser by default", async () => {
        const app = new Shokupan();

        app.post("/test", async (ctx) => {
            const body = await ctx.body();
            return ctx.json({ received: body });
        });

        const res = await app.testRequest({
            method: "POST",
            path: "/test",
            headers: { "content-type": "application/json" },
            body: { test: "value" }
        });

        expect(res.status).toBe(200);
        expect(res.data).toEqual({ received: { test: "value" } });
    });

    test("should use parse-json when configured", async () => {
        const app = new Shokupan({
            jsonParser: 'parse-json'
        });

        app.post("/test", async (ctx) => {
            const body = await ctx.body();
            return ctx.json({ received: body });
        });

        const res = await app.testRequest({
            method: "POST",
            path: "/test",
            headers: { "content-type": "application/json" },
            body: { test: "value", nested: { foo: "bar" } }
        });

        expect(res.status).toBe(200);
        expect(res.data).toEqual({
            received: { test: "value", nested: { foo: "bar" } }
        });
    });

    test("should use secure-json-parse when configured", async () => {
        const app = new Shokupan({
            jsonParser: 'secure-json-parse'
        });

        app.post("/test", async (ctx) => {
            const body = await ctx.body();
            return ctx.json({ received: body });
        });

        const res = await app.testRequest({
            method: "POST",
            path: "/test",
            headers: { "content-type": "application/json" },
            body: { test: "value", array: [1, 2, 3] }
        });

        expect(res.status).toBe(200);
        expect(res.data).toEqual({
            received: { test: "value", array: [1, 2, 3] }
        });
    });

    test("should handle invalid JSON with native parser", async () => {
        const app = new Shokupan();

        app.post("/test", async (ctx) => {
            try {
                await ctx.body();
                return ctx.json({ success: true });
            } catch (e: any) {
                return ctx.json({ error: e.message }, 400);
            }
        });

        // Create a request with invalid JSON
        const res = await app.testRequest({
            method: "POST",
            path: "/test",
            headers: { "content-type": "application/json" },
            body: "{invalid json}"
        });

        expect(res.status).toBe(400);
        expect(res.data.error).toBeDefined();
    });

    test("should parse complex nested objects", async () => {
        const app = new Shokupan({
            jsonParser: 'parse-json'
        });

        app.post("/test", async (ctx) => {
            const body = await ctx.body();
            return ctx.json({
                receivedKeys: Object.keys(body),
                nestedValue: body.level1?.level2?.level3
            });
        });

        const res = await app.testRequest({
            method: "POST",
            path: "/test",
            headers: { "content-type": "application/json" },
            body: {
                level1: {
                    level2: {
                        level3: "deep value"
                    }
                },
                array: [{ id: 1 }, { id: 2 }]
            }
        });

        expect(res.status).toBe(200);
        expect(res.data.receivedKeys).toContain("level1");
        expect(res.data.receivedKeys).toContain("array");
        expect(res.data.nestedValue).toBe("deep value");
    });
});
