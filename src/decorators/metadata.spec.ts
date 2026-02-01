
import { describe, expect, it } from "bun:test";
import { defineMetadata, getMetadata } from "./metadata";

describe("Metadata Polyfill", () => {
    it("should define and get metadata", () => {
        const target = {};
        defineMetadata('key', 'value', target);
        expect(getMetadata('key', target)).toBe('value');
    });

    it("should handle property metadata", () => {
        const target = {};
        defineMetadata('key', 'value', target, 'prop');
        expect(getMetadata('key', target, 'prop')).toBe('value');
        expect(getMetadata('key', target)).toBeUndefined();
    });

    it("should work via Reflect (if polyfilled)", () => {
        // The file executes polyfill side effects on import.
        // Expect global Reflect to be patched
        const target = {};
        Reflect.defineMetadata('rkey', 'rval', target);
        expect(Reflect.getMetadata('rkey', target)).toBe('rval');
    });
});
