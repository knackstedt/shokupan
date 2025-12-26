
import { describe, expect, test } from "bun:test";
import { ConvectionRouter } from '../router';

describe("OpenAPI Configurable Tags", () => {
    test("should use configured default tag group", () => {
        const router = new ConvectionRouter();
        router.get("/hello", async () => "Hello");

        const spec = router.generateApiSpec({
            defaultTagGroup: "MyGroup"
        });

        const tagGroups = spec["x-tagGroups"] as any[];
        const myGroup = tagGroups.find(g => g.name === "MyGroup");

        expect(myGroup).toBeDefined();
        // The default tag for the route should be "Application" (new default)
        expect(myGroup!.tags).toContain("Application");
    });

    test("should use configured default tag", () => {
        const router = new ConvectionRouter();
        router.get("/hello", async () => "Hello");

        const spec = router.generateApiSpec({
            defaultTag: "MyTag"
        });

        const getOp = spec.paths!["/hello"].get!;
        expect(getOp.tags).toContain("MyTag");
        expect(getOp.tags).not.toContain("Application");

        // Should still use "General" as default group
        const tagGroups = spec["x-tagGroups"] as any[];
        const generalGroup = tagGroups.find(g => g.name === "General");
        expect(generalGroup).toBeDefined();
        expect(generalGroup!.tags).toContain("MyTag");
    });

    test("should use both configured default group and tag", () => {
        const router = new ConvectionRouter();
        router.get("/hello", async () => "Hello");

        const spec = router.generateApiSpec({
            defaultTagGroup: "CustomGroup",
            defaultTag: "CustomTag"
        });

        const getOp = spec.paths!["/hello"].get!;
        expect(getOp.tags).toContain("CustomTag");

        const tagGroups = spec["x-tagGroups"] as any[];
        const customGroup = tagGroups.find(g => g.name === "CustomGroup");
        expect(customGroup).toBeDefined();
        expect(customGroup!.tags).toContain("CustomTag");
    });

    test("should use default values if options not provided", () => {
        const router = new ConvectionRouter();
        router.get("/hello", async () => "Hello");

        const spec = router.generateApiSpec();

        const getOp = spec.paths!["/hello"].get!;
        expect(getOp.tags).toContain("Application"); // New default

        const tagGroups = spec["x-tagGroups"] as any[];
        const generalGroup = tagGroups.find(g => g.name === "General");
        expect(generalGroup).toBeDefined();
        expect(generalGroup!.tags).toContain("Application");
    });
});
