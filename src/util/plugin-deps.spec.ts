
import { describe, expect, it } from "bun:test";
import { isPackageAvailable, loadPluginDependency } from "./plugin-deps";

describe("Plugin Dependency Loader", () => {
    it("should check if package is available", async () => {
        const available = await isPackageAvailable("bun:test");
        // bun:test is builtin, maybe it works?
        // Or "typescript" if installed.
        // Let's assume typescript is installed as dev dep.
        const tsAvailable = await isPackageAvailable("typescript");
        expect(tsAvailable).toBe(true);

        const garbage = await isPackageAvailable("non-existent-pkg-xyz-123");
        expect(garbage).toBe(false);
    });

    it("should load available package", async () => {
        const mod = await loadPluginDependency("typescript", "test-plugin");
        expect(mod).toBeDefined();
    });

    it("should throw and suggest command for missing package", async () => {
        try {
            await loadPluginDependency("missing-pkg", "test-plugin", "npm i missing");
            expect(true).toBe(false); // Should fail
        } catch (e: any) {
            expect(e.message).toContain("test-plugin plugin requires missing-pkg");
            expect(e.message).toContain("npm i missing");
        }
    });
});
