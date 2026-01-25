
import { describe, expect, it } from "bun:test";
import { ShokupanRouter } from "../../../router";
import { generateOpenApi } from "./openapi";

describe("OpenAPI Generator Tool", () => {
    it("should generate spec structure", async () => {
        const router = new ShokupanRouter();
        const spec = await generateOpenApi(router, { info: { title: "Test", version: "1.0.0" } });
        expect(spec.openapi).toBe("3.1.0");
        expect(spec.info.title).toBe("Test");
        expect(spec.paths).toBeDefined();
    });
});
