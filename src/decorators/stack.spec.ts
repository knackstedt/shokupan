
import { describe, expect, it } from "bun:test";
import { getCallerInfo } from "./stack";

describe("Stack Util", () => {
    it("should return caller info", () => {
        function testCaller() {
            return getCallerInfo(1);
        }
        const info = testCaller();
        expect(info.file).not.toBe('unknown');
        // It might be absolute path or relative depending on env
        expect(info.file).toContain('stack.spec.ts');
        expect(info.line).toBeGreaterThan(0);
    });

    it("should handle skip frames", () => {
        function inner() {
            return getCallerInfo(1);
        }
        function outer() {
            return inner();
        }
        const info = outer();
        // Should point to where outer() was called
        expect(info.file).toContain('stack.spec.ts');
    });
});
