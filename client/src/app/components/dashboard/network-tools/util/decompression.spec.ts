import { describe, expect, test } from "bun:test";
import { deflateSync, gzipSync } from "fflate";
import { compress as zstdCompress } from "fzstd";
import { decompress } from "./decompression";
// brotli-wasm is a bit tricky in Bun because it needs the wasm file,
// but we can skip it or try to load it if needed.
// For now let's test the ones that are definitely synchronous and easy.

describe("decompression utility", () => {
    const originalText = "Hello Shokupan! Decompress me.";
    const originalData = new TextEncoder().encode(originalText);

    test("should decompress gzip", async () => {
        const compressed = gzipSync(originalData);
        const decompressed = await decompress(compressed, "gzip");
        expect(new TextDecoder().decode(decompressed)).toBe(originalText);
    });

    test("should decompress deflate", async () => {
        const compressed = deflateSync(originalData);
        const decompressed = await decompress(compressed, "deflate");
        expect(new TextDecoder().decode(decompressed)).toBe(originalText);
    });

    test("should decompress zstd", async () => {
        const compressed = zstdCompress(originalData);
        const decompressed = await decompress(compressed, "zstd");
        expect(new TextDecoder().decode(decompressed)).toBe(originalText);
    });

    test("should return original data for unknown encoding", async () => {
        const decompressed = await decompress(originalData, "identity");
        expect(new TextDecoder().decode(decompressed)).toBe(originalText);
    });
});
