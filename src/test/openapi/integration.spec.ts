import { describe, expect, it } from "bun:test";
import type { ShokupanContext } from "../../context";
import { ScalarPlugin } from "../../plugins/application/scalar";
import { ShokupanRouter } from "../../router";
import { Shokupan } from "../../shokupan";
import { $controllerPath, $routeMethods } from '../../util/symbol';


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
    async getUsers(ctx: ShokupanContext) {
        return [{ id: 1, name: "Alice" }];
    }

    @Get("/:id")
    async getUser(ctx: ShokupanContext) {
        return { id: ctx.params['id'], name: "Alice" };
    }
}

// Plain object binding
const AuthBinding = {
    // Should map to GET /auth/login
    async getLogin(ctx: ShokupanContext) {
        return "Login Page";
    },
    // Should map to POST /auth/login
    async postLogin(ctx: ShokupanContext) {
        return { token: "abc" };
    }
};

describe("OpenAPI Integration", () => {
    it("should include all route types, guards, mounts, and bindings in OpenAPI spec", async () => {
        const app = new Shokupan();

        // 1. Basic Routes
        app.get("/health", { summary: "Health Check", responses: { 200: { description: "Successful response" } } }, () => "OK");
        app.post("/submit", { summary: "Submit Data", responses: { 200: { description: "Successful response" } } }, () => "Received");

        // 2. Guards
        const adminRouter = new ShokupanRouter();
        adminRouter.guard({
            description: "Admin Guard",
            security: [{ bearerAuth: [] }]
        }, async (ctx, next) => next && next());

        adminRouter.get("/dashboard", { summary: "Admin Dashboard", responses: { 200: { description: "Successful response" } } }, () => "Dashboard");
        app.mount("/admin", adminRouter);

        // 3. Mounted Controller (Class)
        app.mount("/api", UserController);

        // 4. Mounted Bindings (Object)
        app.mount("/auth", AuthBinding as any);

        const spec = await app.generateApiSpec({
            info: { title: "Complete API", version: "1.0.0" }
        });

        // Verifications
        expect(spec.paths).toBeDefined();

        // 1. Basic Routes
        expect(spec.paths!["/health"]).toBeDefined();
        // expect(spec.paths!["/health"].get!.summary).toBe("Health Check");
        expect(spec.paths!["/submit"]).toBeDefined();
        // expect(spec.paths!["/submit"].post!.summary).toBe("Submit Data");

        // 2. Guards & Nested Router
        expect(spec.paths!["/admin/dashboard"]).toBeDefined();

        // 3. Mounted Controller
        const usersRoot = spec.paths!["/api/users/"] || spec.paths!["/api/users"];
        expect(usersRoot).toBeDefined();

        const usersId = spec.paths!["/api/users/{id}"];
        expect(usersId).toBeDefined();

        // 4. Mounted Bindings
        const authLogin = spec.paths!["/auth/login"];
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
