
import { describe, expect, test } from "bun:test";
import { Shokupan } from '../../../shokupan';
import { ScalarPlugin } from '../scalar';

describe("Scalar Plugin Rendering with Eta", () => {
    test("should render API reference HTML using Eta", async () => {
        const app = new Shokupan();

        // Convert to unknown then any to bypass type mismatch if specific versions differ, 
        // though they should match from package.json
        const plugin = new ScalarPlugin({
            baseDocument: { openapi: "3.1.0", info: { title: "Test", version: "1.0" } },
            config: {}
        });

        app.mount("/docs", plugin);

        const res = await app.testRequest({
            method: "GET",
            path: "/docs/"
        });

        expect(res.status).toBe(200);
        expect(res.data).toBeString();
        // Check for Eta rendered content
        expect(res.data).toContain("<!doctype html>");
        expect(res.data).toContain("<title>API Reference</title>");
        expect(res.data).toContain('src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"');
        expect(res.data).toContain('url: "/docs/openapi.json"');

        // Check escaped/unescaped content if any (JSON.stringify uses <%~ %> in my change)
        expect(res.data).toContain('info');
        expect(res.data).toContain('Test');
    });
});
