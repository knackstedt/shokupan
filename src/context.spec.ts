import { describe, expect, it, mock } from "bun:test";
import { ShokupanContext } from "./context";
import { ShokupanRequest } from './util/request';

describe('ShokupanContext Additions', () => {
    const mockRequest = new ShokupanRequest({
        method: 'GET',
        url: 'http://localhost:3000/test?foo=bar',
        headers: new Headers({
            'x-custom-header': 'custom-value',
            'content-type': 'application/json'
        }),
        body: null
    });

    const mockServer = {
        requestIP: mock(() => ({ address: '127.0.0.1', family: 'IPv4', port: 12345 }))
    };

    const ctx = new ShokupanContext(mockRequest, mockServer as any);

    it('should have correct url properties', () => {
        expect(ctx.host).toBe('localhost:3000');
        expect(ctx.hostname).toBe('localhost');
        expect(ctx.protocol).toBe('http:');
        expect(ctx.secure).toBe(false);
        expect(ctx.origin).toBe('http://localhost:3000');
    });

    it('should return correct header using get()', () => {
        expect(ctx.get('x-custom-header')).toBe('custom-value');
        expect(ctx.get('content-type')).toBe('application/json');
        expect(ctx.get('non-existent')).toBe(null);
    });

    it('should return ip address', () => {
        const ip = ctx.ip;
        expect(ip).toEqual({ address: '127.0.0.1', family: 'IPv4', port: 12345 });
        expect(mockServer.requestIP).toHaveBeenCalled();
    });

    it('should handle https protocol for secure check', () => {
        const secureRequest = new ShokupanRequest({
            method: 'GET',
            url: 'https://example.com/',
            headers: new Headers(),
            body: null
        });
        const secureCtx = new ShokupanContext(secureRequest);
        expect(secureCtx.secure).toBe(true);
        expect(secureCtx.protocol).toBe('https:');
    });

    it('should allow accessing params', () => {
        ctx.params = { id: '123', section: 'profile' };
        expect(ctx.params['id']).toBe('123');
        expect(ctx.params['section']).toBe('profile');
    });
});
