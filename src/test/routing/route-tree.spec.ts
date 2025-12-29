
import { describe, expect, test } from "bun:test";
import { ShokupanContext } from '../../context';
import { ShokupanRouter } from '../../router';
import { Shokupan } from '../../shokupan';

// Mock controller
class UserController {
    get(ctx: ShokupanContext) { return "getAll"; }
    getProfile(ctx: ShokupanContext) { return "getProfile"; }
    postCreate(ctx: ShokupanContext) { return "create"; }
}

describe("Routing Tree Structure", () => {
    test("should correctly build and expose the routing tree", () => {
        const app = new Shokupan();

        // Level 1 Router
        const apiRouter = new ShokupanRouter();
        apiRouter.get("/status", () => "ok");

        // Level 2 Router
        const v1Router = new ShokupanRouter();
        v1Router.get("/version", () => "v1");

        // Mount logic
        apiRouter.mount("/v1", v1Router);
        app.mount("/api", apiRouter);

        // Mount controller
        app.mount("/users", UserController);

        // Check routes
        const routes = app.getRoutes();
        const paths = routes.map(r => `${r.method} ${r.path}`);

        const expected = [
            "GET /api/status",
            "GET /api/v1/version",
            "GET /users",
            "GET /users/profile",
            "POST /users/create"
        ];

        for (const exp of expected) {
            expect(paths).toContain(exp);
        }

        expect(routes.length).toBeGreaterThan(0);
        expect(paths.length).toBeGreaterThanOrEqual(expected.length);
    });
});
