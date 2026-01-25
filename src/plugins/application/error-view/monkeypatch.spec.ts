import { describe, expect, it } from "bun:test";
import { applyMonkeyPatch } from "./monkeypatch";

describe("Error Overlay Monkeypatch", () => {
    it("should increase stack trace limit", () => {
        const oldLimit = Error.stackTraceLimit;
        applyMonkeyPatch();
        expect(Error.stackTraceLimit).toBe(50);

        // Restore (best effort)
        Error.stackTraceLimit = oldLimit;
    });
});
