import { deflateSync, gzipSync } from "fflate";
import { decompress } from "./decompression";

describe("decompression utility", () => {
    const originalText = "Hello Shokupan! Decompress me.";
    const originalData = new TextEncoder().encode(originalText);

    it("should decompress gzip", async () => {
        const compressed = gzipSync(originalData);
        const decompressed = await decompress(compressed, "gzip");
        expect(new TextDecoder().decode(decompressed)).toBe(originalText);
    });

    it("should decompress deflate", async () => {
        const compressed = deflateSync(originalData);
        const decompressed = await decompress(compressed, "deflate");
        expect(new TextDecoder().decode(decompressed)).toBe(originalText);
    });

    it("should decompress zstd", async () => {
        const compressed = new Uint8Array([
            40, 181, 47, 253, 32, 30, 241, 0, 0, 72, 101, 108, 108, 111, 32, 83,
            104, 111, 107, 117, 112, 97, 110, 33, 32, 68, 101, 99, 111, 109, 112, 114,
            101, 115, 115, 32, 109, 101, 46
        ]);
        const decompressed = await decompress(compressed, "zstd");
        expect(new TextDecoder().decode(decompressed)).toBe(originalText);
    });

    it("should return original data for unknown encoding", async () => {
        const decompressed = await decompress(originalData, "identity");
        expect(new TextDecoder().decode(decompressed)).toBe(originalText);
    });
});
