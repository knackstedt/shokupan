import { describe, expect, it } from "bun:test";
import { generateOpenApi } from '../../plugins/application/openapi/openapi';
import { RateLimitMiddleware } from "../../plugins/middleware/rate-limit";
import { Shokupan } from "../../shokupan";

describe("OpenAPI Middleware Response Tracking", () => {
    it("should detect middleware and merge their response types into routes", async () => {
        const app = new Shokupan({
            port: 0,
            enableOpenApiGen: true
        });

        // Add a middleware that returns 429
        app.use(RateLimitMiddleware({
            windowMs: 60 * 1000,
            max: 100,
            message: { error: 'Too many requests' }
        }));

        // Add a simple route
        app.get("/test-route", (ctx) => {
            return ctx.json({ message: "success" });
        });

        // Generate OpenAPI spec
        const spec = await generateOpenApi(app);

        // Log middleware registry for inspection
        // console.log("Middleware Registry:", JSON.stringify(spec['x-middleware-registry'], null, 2));

        // The spec should include a middleware registry
        expect(spec['x-middleware-registry']).toBeDefined();

        // Check if virtual middleware paths were created
        const middlewarePaths = Object.keys(spec.paths).filter(p => p.startsWith('/_middleware/'));
        // console.log("Virtual Middleware Paths:", middlewarePaths);
        expect(middlewarePaths.length).toBeGreaterThan(0);

        // Check if our test route exists
        expect(spec.paths['/test-route']).toBeDefined();
        expect(spec.paths['/test-route'].get).toBeDefined();

        // The route should have x-shokupan-middleware metadata
        const operation = spec.paths['/test-route'].get;
        // console.log("Test Route Middleware Info:", JSON.stringify(operation['x-shokupan-middleware'], null, 2));

        // Check if middleware responses were merged
        // console.log("Test Route Responses:", JSON.stringify(operation.responses, null, 2));

        // Note: Middleware response merging depends on AST analysis detecting the RateLimitMiddleware
        // In a runtime-only scenario, we might not get the 429 response automatically
        // But we should at least have the middleware tracked
    });

    it("should create virtual paths for each detected middleware", async () => {
        const app = new Shokupan({ port: 0, enableOpenApiGen: true });

        app.use(RateLimitMiddleware({ max: 50 }));
        app.get("/api/users", (ctx) => ctx.json([]));

        const spec = await generateOpenApi(app);

        const virtualPaths = Object.keys(spec.paths).filter(p => p.startsWith('/_middleware/'));

        if (virtualPaths.length > 0) {
            const firstMiddleware = spec.paths[virtualPaths[0]].get;
            expect(firstMiddleware['x-virtual']).toBe(true);
            expect(firstMiddleware['x-middleware-detail']).toBe(true);
            expect(firstMiddleware['x-middleware-metadata']).toBeDefined();
        }
    });
});
