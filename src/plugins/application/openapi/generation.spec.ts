import { describe, expect, it } from "bun:test";
import { getSharedSpec } from "./test-setup";

describe("OpenAPI Generation", () => {
    it("should generate a basic spec for a router", async () => {
        const spec = await getSharedSpec();
        const path = "/generation/basic/users/{id}";

        expect(spec.paths![path]).toBeDefined();

        const getOp = spec.paths![path].get!;
        expect(getOp.summary).toBe("Get User");
        expect(getOp.responses["200"].description).toBe("User found");

        // Check params
        expect(getOp.parameters).toBeDefined();
        // There might be more params if global ones exist, but we expect at least the path one
        expect(getOp.parameters.length).toBeGreaterThanOrEqual(1);

        const idParam = getOp.parameters.find((p: any) => p.name === 'id');
        expect(idParam).toMatchObject({
            name: "id",
            in: "path",
            required: true
        });
    });

    it("should merge guard specs", async () => {
        const spec = await getSharedSpec();
        const path = "/generation/guard/secure";
        const postOp = spec.paths![path].post!;

        expect(postOp.security).toEqual([{ bearerAuth: [] }]);
        expect(postOp.responses["401"]).toBeDefined();
        expect(postOp.responses["200"]).toBeDefined(); // Default
    });

    it("should handle nested routers and path normalization", async () => {
        const spec = await getSharedSpec();
        const path = "/generation/nested/api/v1/users/{userId}/posts";

        // expected: /generation/nested/api/v1/users/:userId/posts -> /generation/nested/api/v1/users/{userId}/posts
        expect(spec.paths![path]).toBeDefined();
    });
});
