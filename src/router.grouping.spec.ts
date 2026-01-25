
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { join } from 'path';
import { ShokupanRouter } from './router';
import { Shokupan } from './shokupan';

describe("Static Route Grouping", () => {
    const testDir = join(process.cwd(), "test_static_grouping");

    beforeAll(async () => {
        await mkdir(testDir, { recursive: true });
        await writeFile(join(testDir, "test.txt"), "Hello World");
        await mkdir(join(testDir, "subdir"));
    });

    afterAll(async () => {
        await unlink(join(testDir, "test.txt"));
        await rmdir(join(testDir, "subdir"));
        await rmdir(testDir);
    });

    test("should handle root and child paths with single registration", async () => {
        const app = new Shokupan();
        app.static("/assets", { root: testDir });
        app.static("/images", { root: testDir });
        app.static("/files", { root: testDir });

        // Test Root (should redirect to slash or serve index if configured, here 403 or 404 behavior by default if no index)
        // Actually default behavior is to try index.html, then 403/404 if listDirectory false.

        // Let's test a file directly
        const resFile = await app.testRequest({
            method: "GET",
            path: "/assets/test.txt"
        });
        expect(resFile.status).toBe(200);
        expect(resFile.data).toBe("Hello World");

        // Test 404
        const res404 = await app.testRequest({
            method: "GET",
            path: "/assets/notfound.txt"
        });
        expect(res404.status).toBe(404);
    });

    test("should generate correct OpenAPI spec", async () => {
        const router = new ShokupanRouter();
        router.static("/assets", { root: testDir });

        const spec = await router.generateApiSpec();

        // Check for merged path
        expect(spec.paths!["/assets/*"]).toBeDefined();

        // Helper to check a path
        const check = (path: string, expectedTag: string) => {
            const getOp = spec.paths![path].get!;
            expect(getOp.tags).toContain(expectedTag);
            expect(getOp.tags).not.toContain("General");
        };

        check("/assets/*", "Assets");
        // Add checks for other routes if we added them to router

        // But wait, the router instance in THIS test block only has /assets.
        // I need to add /images and /files to THIS router to verify the "All in General" theory.
    });

    test("should group multiple static routes correctly under General", async () => {
        const router = new ShokupanRouter();
        router.static("/assets", { root: testDir });
        router.static("/images", { root: testDir });
        router.static("/files", { root: testDir });

        const spec = await router.generateApiSpec();

        const tagGroups = spec["x-tagGroups"] as any[];
        const generalGroup = tagGroups.find(g => g.name === "General");

        expect(generalGroup).toBeDefined();
        expect(generalGroup!.tags).toContain("Assets");
        expect(generalGroup!.tags).toContain("Images");
        expect(generalGroup!.tags).toContain("Files");

        // Ensure no duplicated groups
        const assetsGroup = tagGroups.find(g => g.name === "Assets");
        expect(assetsGroup).toBeUndefined();
    });
});
