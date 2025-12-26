
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rmdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { Convection } from '../convect';

describe("Convection Static Serving with Eta", () => {
    const testDir = join(process.cwd(), "test_static_eta");

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

    test("should list directory contents formatted with Eta", async () => {
        const app = new Convection();
        // Use directory listing option
        app.static("/static", { root: testDir, listDirectory: true });

        const res = await app.processRequest({
            method: "GET",
            path: "/static/"
        });

        expect(res.status).toBe(200);
        expect(res.data).toBeString();
        // Check for specific elements that indicate successful Eta rendering
        expect(res.data).toContain("Index of /");
        expect(res.data).toContain("test.txt");
        expect(res.data).toContain("subdir");
        expect(res.data).toContain('href="test.txt"');
        // If eta failed, it might throw or return empty, or render tags literally if configured wrong (though default eta config parses <%)
    });
});
