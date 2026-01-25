
import { describe, expect, it } from "bun:test";
import { readSourceContext } from "./source-reader";

describe("Source Reader", () => {
    it("should read context from file", async () => {
        // Create a dummy file
        const path = "temp-source-read.ts";
        await Bun.write(path, "line1\nline2\nline3\nline4\nline5");

        const ctx = await readSourceContext(path, 3, 1);
        expect(ctx).toBeDefined();
        if (ctx) {
            expect(ctx.lines.length).toBeGreaterThan(0);
            expect(ctx.lines.find(l => l.isTarget)?.code).toBe("line3");
        }
    });

    it("should return null for non-existent file", async () => {
        const ctx = await readSourceContext("non-existent-file.ts", 1);
        expect(ctx).toBeNull();
    });
});
