
import { describe, expect, test } from "bun:test";
import { ShokupanContext } from "../context";
import { ShokupanRouter } from "../router";
import { Shokupan } from "../shokupan";

/**
 * Hierarchy:
 * - App
 *   - /api (ApiRouter)
 *     - /v1 (V1Router)
 *       - /users (UsersController)
 *         - GET /
 *         - GET /:id
 *         - GET /:id/profile
 *       - /posts (PostsController)
 *         - GET /
 *       - /admin (AdminRouter)
 *         - /system (SystemController)
 *           - GET /stats
 *           - GET /logs/:level
 */

// --- Controllers ---

class UsersController {
    // GET /
    get(ctx: ShokupanContext) {
        return { action: "list", users: ["alice", "bob"] };
    }

    // GET /:id
    get$id(ctx: ShokupanContext) {
        return { action: "get", id: ctx.params['id'] };
    }

    // GET /:id/profile
    get$idProfile(ctx: ShokupanContext) {
        return { action: "profile", id: ctx.params['id'] };
    }
}

class PostsController {
    // GET /
    get(ctx: ShokupanContext) {
        return { action: "list_posts" };
    }
}

class SystemController {
    // GET /stats
    getStats(ctx: ShokupanContext) {
        return { action: "stats", uptime: 999 };
    }

    // GET /logs/:level
    getLogs$level(ctx: ShokupanContext) {
        return { action: "logs", level: ctx.params['level'] };
    }
}

// --- Routers ---

class AdminRouter extends ShokupanRouter<any> {
    constructor() {
        super();
        this.mount("/system", SystemController);
    }
}

class V1Router extends ShokupanRouter<any> {
    constructor() {
        super();
        this.mount("/users", UsersController);
        this.mount("/posts", PostsController);
        this.mount("/admin", new AdminRouter());
    }
}

class ApiRouter extends ShokupanRouter<any> {
    constructor() {
        super();
        this.mount("/v1", new V1Router());
    }
}

// --- Tests ---

describe("Complex Router Structure", () => {
    const app = new Shokupan();
    app.mount("/api", new ApiRouter());

    const request = async (path: string) => {
        const res = await app.fetch(new Request(`http://localhost${path}`) as any);
        if (res.headers.get("content-type")?.includes("application/json")) {
            return await res.json();
        }
        return res;
    };

    test("should route to deeply nested UsersController (list)", async () => {
        const res = await request("/api/v1/users");
        expect(res).toEqual({ action: "list", users: ["alice", "bob"] });
    });

    test("should route to deeply nested UsersController (get by id)", async () => {
        const res = await request("/api/v1/users/123");
        expect(res).toEqual({ action: "get", id: "123" });
    });

    test("should route to deeply nested UsersController (profile)", async () => {
        const res = await request("/api/v1/users/456/profile");
        expect(res).toEqual({ action: "profile", id: "456" });
    });

    test("should route to deeply nested PostsController", async () => {
        const res = await request("/api/v1/posts");
        expect(res).toEqual({ action: "list_posts" });
    });

    test("should route to deeply nested SystemController (stats)", async () => {
        const res = await request("/api/v1/admin/system/stats");
        expect(res).toEqual({ action: "stats", uptime: 999 });
    });

    test("should route to deeply nested SystemController (logs param)", async () => {
        const res = await request("/api/v1/admin/system/logs/error");
        expect(res).toEqual({ action: "logs", level: "error" });
    });

    test("should return 404 for unknown routes", async () => {
        const res = await app.fetch(new Request("http://localhost/api/v1/unknown") as any);
        expect(res.status).toBe(404);
    });
});
