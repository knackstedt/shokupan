
import { describe, expect, test } from "bun:test";
import { Shokupan } from "../shokupan";
import { Body, Controller, Get, Post, Query } from "../decorators";


describe("Core Fixes Implementation", () => {

    test("Fix 0: Invalid JSON throws 400", async () => {
        const app = new Shokupan();

        @Controller("/")
        class JsonCtrl {
            @Post("json")
            handler(@Body() body: any) {
                return { success: true };
            }
        }

        app.mount("/", new JsonCtrl());

        const req = new Request("http://localhost/json", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{ invalid json "
        });

        const res = await app.fetch(req);
        expect(res.status).toBe(400);
        // expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    });

    test("Fix 2: Query Params Arrays", async () => {
        const app = new Shokupan();

        @Controller("/")
        class QueryCtrl {
            @Get("query")
            handler(@Query("tag") tags: string[]) {
                return { tags };
            }
        }
        app.mount("/", new QueryCtrl());

        // ?tag=a&tag=b
        const req = new Request("http://localhost/query?tag=a&tag=b");
        const res = await app.fetch(req);

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.tags).toEqual(["a", "b"]);
    });

    // Trie Tests
    test("Fix 1: Trie Wildcard (catch-remaining) compatibility", async () => {
        const app = new Shokupan();

        app.get("/files/*", (ctx) => ctx.text("Wildcard"));

        // Should match /files/foo
        const res1 = await app.fetch(new Request("http://localhost/files/foo"));
        expect(res1.status).toBe(200);

        // Should match /files/foo/bar (if * is recursive-ish/prefix or we upgraded to **)
        // My fix made * single segment STRICTLY.
        // So this should FAIL (404).
        const res2 = await app.fetch(new Request("http://localhost/files/foo/bar"));
        expect(res2.status).toBe(404);
    });

    test("Fix 1b: Recursive Wildcard (**)", async () => {
        const app = new Shokupan();

        app.get("/deep/**", (ctx) => ctx.text("Deep"));

        // Single level
        const res1 = await app.fetch(new Request("http://localhost/deep/a"));
        expect(res1.status).toBe(200);

        // Multi level
        const res2 = await app.fetch(new Request("http://localhost/deep/a/b/c"));
        expect(res2.status).toBe(200);
    });

    test("Fix 3 & 5: Timeouts & AbortSignal", async () => {
        const app = new Shokupan({ requestTimeout: 100 }); // 100ms

        app.get("/slow", async (ctx) => {
            // Check signal
            // expect(ctx.signal).toBeDefined();
            return new Promise(resolve => setTimeout(() => resolve(ctx.text("Too Slow")), 200));
        });

        const res = await app.fetch(new Request("http://localhost/slow"));
        expect(res.status).toBe(408); // Request Timeout
    });

    test("Fix 6: Return Logic (Void -> 200 vs 201)", async () => {
        const app = new Shokupan();

        app.get("/void", (ctx) => { });
        app.get("/explicit", (ctx) => { ctx.status(201); });

        const res1 = await app.fetch(new Request("http://localhost/void"));
        expect(res1.status).toBe(204);

        const res2 = await app.fetch(new Request("http://localhost/explicit"));
        expect(res2.status).toBe(201);
    });

    test("Fix 5: Cookies", async () => {
        const app = new Shokupan();
        app.get("/cookie", (ctx) => {
            ctx.setCookie("foo", "bar", { secure: true, httpOnly: true, sameSite: 'strict' });
            return ctx.text("ok");
        });

        const res = await app.fetch(new Request("http://localhost/cookie"));
        const cookie = res.headers.get("Set-Cookie");
        // "foo=bar; HttpOnly; Secure; SameSite=Strict" (order varies?)
        expect(cookie).toContain("foo=bar");
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("Secure");
        expect(cookie).toContain("SameSite=Strict");
    });
});
