
import { describe, expect, it } from "bun:test";
import { SecurityHeaders } from "../../plugins/middleware/security-headers";
import { Shokupan } from "../../shokupan";

describe("Routing 404 Issue", () => {
    it("should return 404 for non-existent route when middleware sets headers", async () => {
        const app = new Shokupan();

        // Simulating middleware that sets headers (like SecurityHeaders or CORS)
        app.use(async (ctx, next) => {
            ctx.set("X-Custom-Header", "value");
            return next();
        });

        // Or using actual plugin
        app.use(SecurityHeaders());

        const res = await app.testRequest({
            method: "GET",
            path: "/non-existent-route"
        });

        expect(res.status).toBe(404);
        expect(res.data).toBe("Not Found");
    });

    it("should return 200 OK for matched route with empty handler", async () => {
        const app = new Shokupan();

        app.get("/empty", () => { });

        const res = await app.testRequest({
            method: "GET",
            path: "/empty"
        });

        expect(res.status).toBe(200);
        expect(res.data).toBe("");
    });
});
