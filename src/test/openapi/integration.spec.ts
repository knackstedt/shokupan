import { describe, expect, it } from "bun:test";
import { ScalarPlugin } from "../../plugins/application/scalar";
import { Shokupan } from "../../shokupan";
import { getSharedSpec } from "./test-setup";

describe("OpenAPI Integration", () => {
    it("should include all route types, guards, mounts, and bindings in OpenAPI spec", async () => {
        const spec = await getSharedSpec();

        // 1. Basic Routes
        expect(spec.paths!["/integration/health"]).toBeDefined();
        expect(spec.paths!["/integration/submit"]).toBeDefined();

        // 2. Guards & Nested Router
        expect(spec.paths!["/integration/admin/dashboard"]).toBeDefined();

        // 3. Mounted Controller
        // Controller was mapped to /users, mounted at /integration/api
        const usersRoot = spec.paths!["/integration/api/users/"] || spec.paths!["/integration/api/users"];
        expect(usersRoot).toBeDefined();

        const usersId = spec.paths!["/integration/api/users/{id}"];
        expect(usersId).toBeDefined();

        // 4. Mounted Bindings
        // Binding was mapped to /login, mounted at /integration/auth
        const authLogin = spec.paths!["/integration/auth/login"];
        expect(authLogin).toBeDefined();
        expect(authLogin!.get).toBeDefined();
        expect(authLogin!.post).toBeDefined();
    });

    it("should generate full spec from ScalarPlugin mount", async () => {
        const app = new Shokupan();
        app.get("/app-root", () => "root");

        const plugin = new ScalarPlugin({
            baseDocument: { info: { title: "Test", version: "1" } },
            config: {}
        });

        app.mount("/docs", plugin);

        // Use internalRequest to trigger spec generation inside the plugin
        // Note: ScalarPlugin serves spec at /docs/openapi.json
        const response = await app.internalRequest("/docs/openapi.json");
        expect(response.status).toBe(200);
        const spec = await response.json();

        expect((spec as any).paths["/app-root"]).toBeDefined();
    });
});
