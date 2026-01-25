
import { describe, expect, it } from "bun:test";
import { DefaultFileSystemAdapter, NoOpFileSystemAdapter } from "./filesystem";

describe("DefaultFileSystem Adapter", () => {
    it("should read file using Bun.file", async () => {
        const adapter = new DefaultFileSystemAdapter();
        // Read this file itself
        const content = await adapter.readFile(import.meta.file);
        expect(content).toBeDefined();
    });

    it("should stat file", async () => {
        const adapter = new DefaultFileSystemAdapter();
        // Create a temp file
        const path = "temp-stat-test.txt";
        await Bun.write(path, "content");

        try {
            const stat = await adapter.stat(path);
            expect(stat.size).toBeGreaterThan(0);
        } finally {
            // cleanup if possible, or just leave it (tmp)
            // Bun.file(path).delete() not directly available on file object in strict sense checking?
            // unlinkSync equivalent?
        }
    });
});

describe("NoOpFileSystem Adapter", () => {
    it("should throw on read", async () => {
        const adapter = new NoOpFileSystemAdapter();
        expect(adapter.readFile('foo')).rejects.toThrow();
    });
});
