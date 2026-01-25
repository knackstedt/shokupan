
import { describe, expect, it } from "bun:test";
import { ShokupanRequest } from "./request";

describe("Shokupan Request", () => {
    it("should initialize with props", () => {
        const req = new ShokupanRequest({
            method: 'GET',
            url: 'http://localhost/',
            headers: { 'content-type': 'application/json' },
            body: null
        });
        expect(req.method).toBe('GET');
        expect(req.headers instanceof Headers).toBe(true);
        expect(req.headers.get('content-type')).toBe('application/json');
    });

    it("should parse json body", async () => {
        const req = new ShokupanRequest({
            method: 'POST',
            url: '/',
            headers: {},
            body: '{"foo":"bar"}'
        });
        expect(await req.json()).toEqual({ foo: 'bar' });
    });

    it("should return text body", async () => {
        const req = new ShokupanRequest({
            method: 'POST',
            url: '/',
            headers: {},
            body: 'text'
        });
        expect(await req.text()).toBe('text');
    });

    it("should clone request", () => {
        const req = new ShokupanRequest({
            method: 'GET',
            url: '/',
            headers: { a: 'b' },
            body: null
        });
        const clone = req.clone();
        expect(clone).not.toBe(req);
        expect(clone.headers.get('a')).toBe('b');
    });
});
