
import { describe, expect, test } from "bun:test";
import { ShokupanContext } from "./context";

describe("ShokupanContext", () => {
    test("should parse cookies correctly", () => {
        const req = new Request("http://localhost", {
            headers: {
                "Cookie": "session=123; user=alice; theme=dark"
            }
        });

        // Mock Request with properties
        const mockReq: any = {
            headers: req.headers,
            method: "GET",
            url: "http://localhost"
        };

        const ctx = new ShokupanContext(mockReq);

        const cookies = ctx.cookies;
        expect(cookies).toBeDefined();
        expect(cookies['session']).toBe("123");
        expect(cookies['user']).toBe("alice");
        expect(cookies['theme']).toBe("dark");
    });

    test("should cache parsed cookies", () => {
        const req = new Request("http://localhost", {
            headers: {
                "Cookie": "foo=bar"
            }
        });

        const ctx = new ShokupanContext(req as any);
        const c1 = ctx.cookies;
        const c2 = ctx.cookies;

        expect(c1).toBe(c2); // Reference equality
    });

    test("should handle empty cookies", () => {
        const req = new Request("http://localhost");
        const ctx = new ShokupanContext(req as any);

        const cookies = ctx.cookies;
        expect(cookies).toEqual({});
    });
});
