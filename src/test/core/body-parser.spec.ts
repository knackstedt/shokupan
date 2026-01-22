
import { describe, expect, it } from "bun:test";
import { BodyParser } from "../../util/body-parser";
import { ShokupanRequest } from "../../util/request";

describe('BodyParser', () => {
    it('should parse JSON body', async () => {
        const req = new ShokupanRequest({
            method: 'POST',
            url: 'http://localhost/',
            headers: new Headers({ 'content-type': 'application/json' }),
            body: JSON.stringify({ foo: 'bar' })
        });

        const result = await BodyParser.parse(req as any);
        expect(result.type).toBe('json');
        expect(result.body).toEqual({ foo: 'bar' });
    });

    it('should parse text body', async () => {
        const req = new ShokupanRequest({
            method: 'POST',
            url: 'http://localhost/',
            headers: new Headers({ 'content-type': 'text/plain' }),
            body: 'Hello World'
        });

        const result = await BodyParser.parse(req as any);
        expect(result.type).toBe('text');
        expect(result.body).toBe('Hello World');
    });

    it('should respect maxBodySize', async () => {
        const largeBody = 'a'.repeat(1024 * 1024 + 1); // 1MB + 1
        const req = new ShokupanRequest({
            method: 'POST',
            url: 'http://localhost/',
            headers: new Headers({ 'content-type': 'text/plain' }),
            body: largeBody
        });

        const config = { maxBodySize: 1024 * 1024 }; // 1MB limit

        // Should throw Payload Too Large
        try {
            await BodyParser.parse(req as any, config);
            expect(true).toBe(false); // Should not reach here
        } catch (err: any) {
            expect(err.message).toBe('Payload Too Large');
            expect(err.status).toBe(413);
        }
    });

    it('should respect maxBodySize for JSON', async () => {
        const largeJson = JSON.stringify({ data: 'a'.repeat(1024 * 1024) });
        const req = new ShokupanRequest({
            method: 'POST',
            url: 'http://localhost/',
            headers: new Headers({ 'content-type': 'application/json' }),
            body: largeJson
        });

        const config = { maxBodySize: 1024 }; // Small limit

        try {
            await BodyParser.parse(req as any, config);
            expect(true).toBe(false);
        } catch (err: any) {
            expect(err.message).toBe('Payload Too Large');
            expect(err.status).toBe(413);
        }
    });
});
