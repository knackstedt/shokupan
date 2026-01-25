
import { describe, expect, it } from "bun:test";
import * as Adapter from "./index";

describe("Adapter Index", () => {
    it("should export adapters", () => {
        expect(Adapter.BunAdapter).toBeDefined();
        expect(Adapter.NodeAdapter).toBeDefined();
        expect(Adapter.WinterCGAdapter).toBeDefined();
    });
});
