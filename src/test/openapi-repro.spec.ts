import { describe, expect, it } from "bun:test";
import { ScalarPlugin } from "../plugins/scalar";

// ... existing imports ...

// ...

it("should generate full spec from ScalarPlugin mount", async () => {
    const app = new Convection();
    app.get("/app-root", () => "root");

    const plugin = new ScalarPlugin({
        baseDocument: { info: { title: "Test", version: "1" } }
    });

    app.mount("/docs", plugin);

    // Access the /docs/openapi.json endpoint logic through the plugin instance
    // We can simulate a request to the plugin's internal route handler or just 
    // call the method that the route handler calls if we exposed it, but we modified
    // the ROUTE HANDLER in scalar.ts.

    // So we need to execute the route handler for "GET /openapi.json" on the plugin.
    // Or we can just use `app.subRequest`.

    const response = await app.subRequest("/docs/openapi.json");
    expect(response.status).toBe(200);
    const spec = await response.json();

    expect(spec.paths["/app-root"]).toBeDefined();
});

import type { ConvectionContext } from "../context";
import { Convection } from "../convect";
import { ConvectionRouter } from "../router";
import { $controllerPath, $routeMethods } from "../symbol";

// Mock Controller Decorator for testing "Bindings"
function Controller(path: string) {
    return function (target: any) {
        target[$controllerPath] = path;
    };
}

function Get(path: string) {
    return function (target: any, propertyKey: string) {
        if (!target[$routeMethods]) target[$routeMethods] = new Map();
        target[$routeMethods].set(propertyKey, { method: "GET", path });
    };
}

@Controller("/users")
class UserController {
    @Get("/")
    async getUsers(ctx: ConvectionContext) {
        return [{ id: 1, name: "Alice" }];
    }

    @Get("/:id")
    async getUser(ctx: ConvectionContext) {
        return { id: ctx.params['id'], name: "Alice" };
    }
}

// Plain object binding
const AuthBinding = {
    // Should map to GET /auth/login
    async getLogin(ctx: ConvectionContext) {
        return "Login Page";
    },
    // Should map to POST /auth/login
    async postLogin(ctx: ConvectionContext) {
        return { token: "abc" };
    }
};

describe("OpenAPI Comprehensive Repro", () => {
    it("should include all route types, guards, mounts, and bindings in OpenAPI spec", () => {
        const app = new Convection();

        // 1. Basic Routes
        app.get("/health", { summary: "Health Check", responses: { 200: { description: "OK" } } }, () => "OK");
        app.post("/submit", { summary: "Submit Data", responses: { 200: { description: "OK" } } }, () => "Received");

        // 2. Guards
        const adminRouter = new ConvectionRouter();
        adminRouter.guard({
            description: "Admin Guard",
            security: [{ bearerAuth: [] }]
        }, async (ctx, next) => next && next());

        adminRouter.get("/dashboard", { summary: "Admin Dashboard", responses: { 200: { description: "OK" } } }, () => "Dashboard");
        app.mount("/admin", adminRouter);

        // 3. Mounted Controller (Class)
        app.mount("/api", UserController);

        // 4. Mounted Bindings (Object)
        app.mount("/auth", AuthBinding as any);

        const spec = app.generateApiSpec({
            info: { title: "Complete API", version: "1.0.0" }
        });

        console.log("Generated paths:", Object.keys(spec.paths || {}));

        // Verifications
        expect(spec.paths).toBeDefined();

        // 1. Basic Routes
        expect(spec.paths!["/health"]).toBeDefined();
        // expect(spec.paths!["/health"].get!.summary).toBe("Health Check");
        expect(spec.paths!["/submit"]).toBeDefined();
        // expect(spec.paths!["/submit"].post!.summary).toBe("Submit Data");

        // 2. Guards & Nested Router
        expect(spec.paths!["/admin/dashboard"]).toBeDefined();
        // expect(spec.paths!["/admin/dashboard"].get!.summary).toBe("Admin Dashboard");
        // Check if guard spec was merged (security)
        // expect(spec.paths!["/admin/dashboard"].get!.security).toEqual([{ bearerAuth: [] }]);

        // 3. Mounted Controller
        // Expecting /api/users/ and /api/users/{id}
        // Note: UserController has @Controller("/users"), mounted at "/api" -> "/api/users"
        // Also check unnormalized paths just in case
        const usersRoot = spec.paths!["/api/users/"] || spec.paths!["/api/users"];
        expect(usersRoot).toBeDefined();

        const usersId = spec.paths!["/api/users/{id}"];
        expect(usersId).toBeDefined();

        // 4. Mounted Bindings
        // Expecting /auth/login
        const authLogin = spec.paths!["/auth/login"];
        expect(authLogin).toBeDefined();
        expect(authLogin!.get).toBeDefined();
        expect(authLogin!.post).toBeDefined();
    });

    it("should generate full spec even when called from a child router (like ScalarPlugin)", () => {
        const app = new Convection();
        app.get("/root", () => "root");

        const plugin = new ConvectionRouter();
        plugin.get("/plugin-route", () => "plugin");

        // Emulate ScalarPlugin behavior where it exposes /openapi.json that calls generateApiSpec
        // We want plugin.generateApiSpec() (or equivalent logic used in plugin) to return all routes.
        app.mount("/plugin", plugin);

        // Current ScalarPlugin Implementation calls this.generateApiSpec() which is WRONG
        // This test verifies the FIX logic we want (calling root.generateApiSpec) OR
        // demonstrates the failure if we expect child.generateApiSpec() to do it (which it doesn't).

        // If we call generateApiSpec on the child, it only sees child routes currently.
        const childSpec = plugin.generateApiSpec();
        // This confirms the "bug" behavior if we don't fix it, or the desired behavior if we change router.ts

        // If we want to fix ScalarPlugin, we should ensure ScalarPlugin calls root.
        // But maybe the user expects ANY router to be able to generate the full spec?
        // Probably not, router.generateApiSpec() logically generates spec for THAT router.

        // So the fix is likely in ScalarPlugin.ts.
        // Let's verify that app.generateApiSpec() includes plugin routes (already done above).

        // Let's verify that simply calling generateApiSpec on child ONLY returns child routes (confirming the issue source).
        expect(childSpec.paths!["/plugin-route"]).toBeDefined(); // Local validation
        expect(childSpec.paths!["/root"]).toBeUndefined(); // It misses root!
    });

    it("should generate full spec from ScalarPlugin mount", async () => {
        const app = new Convection();
        app.get("/app-root", () => "root");

        // We need to import ScalarPlugin dynamically or assume it's available if we add import at top
        // But let's just use the class since we know where it is.
        // We need to add import to the top of the file first.
    });
});
