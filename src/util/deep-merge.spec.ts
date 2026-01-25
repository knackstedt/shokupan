
import { describe, expect, it } from "bun:test";
import { deepMerge, isObject } from "./deep-merge";

describe("Deep Merge Util", () => {
    it("should merge two objects", () => {
        const target = { a: 1 };
        const source = { b: 2 };
        const result = deepMerge(target, source);
        expect(result).toEqual({ a: 1, b: 2 });
    });

    it("should merge nested objects", () => {
        const target = { a: { b: 1 } };
        const source = { a: { c: 2 } };
        const result = deepMerge(target, source);
        expect(result).toEqual({ a: { b: 1, c: 2 } });
    });

    it("should overwrite primitives", () => {
        const target = { a: 1 };
        const source = { a: 2 };
        const result = deepMerge(target, source);
        expect(result.a).toBe(2);
    });

    it("should concatenate arrays", () => {
        const target = { list: [1] };
        const source = { list: [2] };
        const result = deepMerge(target, source);
        expect(result.list).toEqual([1, 2]);
    });

    it("should deduplicate primitives in arrays", () => {
        const target = { list: [1, 2] };
        const source = { list: [2, 3] };
        const result = deepMerge(target, source);
        expect(result.list).toEqual([1, 2, 3]);
    });

    it("should overwrite 'tags' array specifically", () => {
        const target = { tags: ["a"] };
        const source = { tags: ["b"] };
        const result = deepMerge(target, source);
        // Special logic in deep-merge.ts overwrites tags
        expect(result.tags).toEqual(["b"]);
    });

    it("isObject check", () => {
        expect(isObject({})).toBe(true);
        expect(isObject([])).toBe(false);
        expect(isObject(null)).toBe(false);
        expect(isObject(1)).toBe(false);
    });
});
