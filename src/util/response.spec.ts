
import { describe, expect, it } from "bun:test";
import { ShokupanResponse } from "./response";

describe("Shokupan Response", () => {
    it("should set and get headers", () => {
        const res = new ShokupanResponse();
        res.set('content-type', 'application/json');
        expect(res.get('content-type')).toBe('application/json');
        expect(res.has('content-type')).toBe(true);
    });

    it("should set and get status", () => {
        const res = new ShokupanResponse();
        expect(res.status).toBe(200);
        res.status = 404;
        expect(res.status).toBe(404);
    });

    it("should append headers", () => {
        const res = new ShokupanResponse();
        res.append('set-cookie', 'a=1');
        res.append('set-cookie', 'b=2');
        expect(res.get('set-cookie')).toContain('a=1');
        expect(res.get('set-cookie')).toContain('b=2');
    });

    it("should track populated headers state", () => {
        const res = new ShokupanResponse();
        expect(res.hasPopulatedHeaders).toBe(false);
        res.set('a', 'b');
        expect(res.hasPopulatedHeaders).toBe(true);
    });
});
