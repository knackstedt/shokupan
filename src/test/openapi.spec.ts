
import { describe, expect, it } from "bun:test";
import { ShokupanRouter } from "../router";

describe("OpenAPI Generation", () => {
    it("should generate a basic spec for a router", () => {
        const router = new ShokupanRouter();
        router.get("/users/:id", {
            summary: "Get User",
            responses: {
                200: { description: "User found" }
            }
        }, (ctx) => ({ id: ctx.params['id'] }));

        const spec = router.generateApiSpec({
            info: { title: "Test API", version: "1.0.0" }
        });

        expect(spec.openapi).toBe("3.1.0");
        expect(spec.info.title).toBe("Test API");
        expect(spec.paths!["/users/{id}"]).toBeDefined();

        const getOp = spec.paths!["/users/{id}"].get!;
        expect(getOp.summary).toBe("Get User");
        expect(getOp.responses["200"].description).toBe("User found");

        // Check params
        expect(getOp.parameters).toBeDefined();
        expect(getOp.parameters).toHaveLength(1);
        expect(getOp.parameters![0]).toMatchObject({
            name: "id",
            in: "path",
            required: true
        });
    });

    it("should merge guard specs", () => {
        const router = new ShokupanRouter();

        router.guard({
            security: [{ bearerAuth: [] }],
            responses: {
                401: { description: "Unauthorized" }
            }
        }, async (ctx, next) => next && next());

        router.post("/secure", (ctx) => "ok");

        const spec = router.generateApiSpec();
        const postOp = spec.paths!["/secure"].post!;

        expect(postOp.security).toEqual([{ bearerAuth: [] }]);
        expect(postOp.responses["401"]).toBeDefined();
        expect(postOp.responses["200"]).toBeDefined(); // Default
    });

    it("should handle nested routers and path normalization", () => {
        const root = new ShokupanRouter();
        const api = new ShokupanRouter();
        const users = new ShokupanRouter();

        users.get("/:userId/posts", (ctx) => []);
        api.mount("/users", users);
        root.mount("/api/v1", api);

        const spec = root.generateApiSpec();

        // expected: /api/v1/users/:userId/posts -> /api/v1/users/{userId}/posts
        expect(spec.paths!["/api/v1/users/{userId}/posts"]).toBeDefined();
    });
});
