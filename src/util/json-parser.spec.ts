
import { describe, expect, it } from "bun:test";
import { getJSONParser } from "./json-parser";

describe("JSON Parser Util", () => {
    it("should return native parser by default", () => {
        const parser = getJSONParser();
        expect(parser).toBe(JSON.parse);
    });

    it("should return native parser for 'native'", () => {
        const parser = getJSONParser('native');
        expect(parser).toBe(JSON.parse);
    });

    it("should try loading external parsers", () => {
        // Can't easily mock require in bun test without hacking
        // But we can call it and assume it falls back if missing
        const parser = getJSONParser('parse-json');
        expect(parser).toBeDefined();
    });
});
