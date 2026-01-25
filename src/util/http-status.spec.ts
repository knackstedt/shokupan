
import { describe, expect, it } from "bun:test";
import { HTTP_STATUS, VALID_HTTP_STATUSES, VALID_REDIRECT_STATUSES } from "./http-status";

describe("HTTP Status Util", () => {
    it("should export status constants", () => {
        expect(HTTP_STATUS.OK).toBe(200);
        expect(HTTP_STATUS.NOT_FOUND).toBe(404);
        expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
    });

    it("should export valid status sets", () => {
        expect(VALID_HTTP_STATUSES.has(200)).toBe(true);
        expect(VALID_HTTP_STATUSES.has(999)).toBe(false);
    });

    it("should export redirect status set", () => {
        expect(VALID_REDIRECT_STATUSES.has(301)).toBe(true);
        expect(VALID_REDIRECT_STATUSES.has(200)).toBe(false);
    });
});
