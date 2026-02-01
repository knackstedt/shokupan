
import { describe, expect, test } from "bun:test";
import { Get, Post } from './http';
import { Shokupan } from '../shokupan';

// Example Controller with mixed usage
class DecoratedController {
    // 1. Standard Convention
    // GET /base/hello
    getHello() {
        return "hello";
    }

    // 2. Decorated (overrides ignore convention based name if it matched)
    // Here "getData" matches convention "GET /data".
    // But decorator sets "GET /custom-data".
    @Get("/custom-data")
    getData() {
        return "data";
    }

    // 3. Decorated (purely custom name, no convention match required)
    // "arbitraryName" doesn't start with verb.
    @Post("/create-stuff")
    arbitraryName() {
        return "created";
    }
}

describe("Decorator Routing", () => {
    const app = new Shokupan();
    app.mount("/base", DecoratedController);

    test("should support standard convention methods alongside decorators", async () => {
        const res = await app.testRequest({ path: "/base/hello" });
        expect(res.status).toBe(200);
        expect(res.data).toBe("hello");
    });

    test("should use decorator path instead of method name convention", async () => {
        // "getData" -> Convention would be /base/data. Decorator is /base/custom-data.

        // 1. Check Convention is IGNORED (if logic is: decorator overrides/replaces)
        // Wait, current logic: IF decorator present -> match. ELSE -> convention.
        // So /base/data should NOT exist.
        const resConvention = await app.testRequest({ path: "/base/data" });
        expect(resConvention.status).toBe(404);

        // 2. Check Decorator path works
        const resDecorated = await app.testRequest({ path: "/base/custom-data" });
        expect(resDecorated.status).toBe(200);
        expect(resDecorated.data).toBe("data");
    });

    test("should allow decorating arbitrary method names", async () => {
        const res = await app.testRequest({
            path: "/base/create-stuff",
            method: "POST"
        });
        expect(res.status).toBe(200);
        expect(res.data).toBe("created");
    });
});
