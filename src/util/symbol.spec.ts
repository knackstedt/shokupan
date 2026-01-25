
import { describe, expect, it } from "bun:test";
import * as Symbols from "./symbol";

describe("Symbols Util", () => {
    it("should export defined symbols", () => {
        expect(Symbols.$isApplication).toBeDefined();
        expect(typeof Symbols.$isApplication).toBe("symbol");
        expect(Symbols.$appRoot).toBeDefined();
    });
});
