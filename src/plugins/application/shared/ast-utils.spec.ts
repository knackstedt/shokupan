
import { describe, expect, it } from "bun:test";
import { getAstRoutes } from "./ast-utils";

describe("AST Utils", () => {
    it("should extract routes from application", async () => {
        const mockApp = {
            name: "App",
            routes: [
                { method: "GET", path: "/hello" }
            ],
            mounted: []
        };

        const routes = await getAstRoutes([mockApp]);
        expect(routes).toBeArray();
        expect(routes).toHaveLength(1);
        expect(routes[0].path).toBe("/hello");
    });

    it("should handle mounted sub-apps", async () => {
        const subApp = {
            name: "Sub",
            routes: [
                { method: "POST", path: "/data" }
            ]
        };
        const mainApp = {
            name: "Main",
            routes: [],
            mounted: [
                { target: "Sub", prefix: "/api" }
            ]
        };

        const routes = await getAstRoutes([mainApp, subApp]);
        // Should contain /api/data AND /data (raw)
        expect(routes.length).toBeGreaterThanOrEqual(1);
        const mounted = routes.find(r => r.path === "/api/data");
        expect(mounted).toBeDefined();
        expect(mounted!.method).toBe("POST");
    });

    it("should deduplicate routes", async () => {
        const mockApp = {
            name: "App",
            routes: [
                { method: "GET", path: "/dup", responseSchema: true },
                { method: "GET", path: "/dup" } // lower score
            ]
        };
        const routes = await getAstRoutes([mockApp]);
        expect(routes).toHaveLength(1);
        // Should keep the one with responseSchema (score 10)
        expect(routes[0].responseSchema).toBe(true);
    });
});
