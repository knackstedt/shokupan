
import { describe, expect, test } from "bun:test";
import { ScalarPlugin } from '../../plugins/scalar';
import { Shokupan } from '../../shokupan';

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

        const res = await app.processRequest({
            method: "GET",
            path: "/docs/"
        });

        expect(res.status).toBe(200);
        expect(res.data).toBeString();
        // Check for Eta rendered content
        expect(res.data).toContain("<!doctype html>");
        expect(res.data).toContain("<title>API Reference</title>");
        expect(res.data).toContain('src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"');
        expect(res.data).toContain('url: "http://localhost:3000/docs/openapi.json"');

        // Check escaped/unescaped content if any (JSON.stringify uses <%~ %> in my change)
        expect(res.data).toContain('info');
        expect(res.data).toContain('Test');
    });
});
