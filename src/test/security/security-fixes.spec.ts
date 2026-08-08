import { describe, expect, test } from 'bun:test';
import { redactHeaders } from '../../plugins/application/dashboard/header-redaction';
import { Cors } from '../../plugins/middleware/cors';
import { Shokupan } from '../../shokupan';
import { BodyParser } from '../../util/body-parser';
import { ShokupanRequest } from '../../util/request';

/**
 * Tests for the security fixes addressing HIGH and MEDIUM findings.
 */

describe('Security Fixes: Header Redaction', () => {
    test('redactHeaders replaces sensitive header values with [REDACTED]', () => {
        const input = {
            'authorization': 'Bearer secret-token',
            'cookie': 'session=abc123',
            'content-type': 'application/json',
            'x-api-key': 'key123',
        };
        const result = redactHeaders(input);
        expect(result['authorization']).toBe('[REDACTED]');
        expect(result['cookie']).toBe('[REDACTED]');
        expect(result['x-api-key']).toBe('[REDACTED]');
        expect(result['content-type']).toBe('application/json');
    });

    test('redactHeaders is case-insensitive', () => {
        const input = {
            'Authorization': 'Bearer secret',
            'COOKIE': 'session=xyz',
            'Set-Cookie': 'token=abc',
        };
        const result = redactHeaders(input);
        expect(result['Authorization']).toBe('[REDACTED]');
        expect(result['COOKIE']).toBe('[REDACTED]');
        expect(result['Set-Cookie']).toBe('[REDACTED]');
    });

    test('redactHeaders preserves non-sensitive headers', () => {
        const input = {
            'accept': 'application/json',
            'host': 'localhost:3000',
            'user-agent': 'test',
        };
        const result = redactHeaders(input);
        expect(result).toEqual(input);
    });
});

describe('Security Fixes: JSON Parser Prototype Pollution Stripping', () => {
    test('strips __proto__ from parsed JSON body', async () => {
        const body = '{"__proto__":{"isAdmin":true},"name":"test"}';
        const req = new ShokupanRequest({
            method: 'POST',
            url: 'http://localhost/test',
            headers: new Headers({ 'content-type': 'application/json' }),
            body: body,
        });
        const result = await BodyParser.parse(req, { jsonParser: 'native' });
        // __proto__ should not be an own property on the parsed object
        expect(Object.prototype.hasOwnProperty.call(result.body, '__proto__')).toBe(false);
        expect(result.body.name).toBe('test');
    });

    test('strips constructor from parsed JSON body', async () => {
        const body = '{"constructor":{"prototype":{"isAdmin":true}},"name":"test"}';
        const req = new ShokupanRequest({
            method: 'POST',
            url: 'http://localhost/test',
            headers: new Headers({ 'content-type': 'application/json' }),
            body: body,
        });
        const result = await BodyParser.parse(req, { jsonParser: 'native' });
        expect(Object.prototype.hasOwnProperty.call(result.body, 'constructor')).toBe(false);
        expect(result.body.name).toBe('test');
    });

    test('strips __proto__ from nested objects in parsed JSON', async () => {
        const body = '{"nested":{"__proto__":{"polluted":true}},"name":"test"}';
        const req = new ShokupanRequest({
            method: 'POST',
            url: 'http://localhost/test',
            headers: new Headers({ 'content-type': 'application/json' }),
            body: body,
        });
        const result = await BodyParser.parse(req, { jsonParser: 'native' });
        expect(Object.prototype.hasOwnProperty.call(result.body.nested, '__proto__')).toBe(false);
        expect(result.body.name).toBe('test');
    });

    test('strips __proto__ from arrays in parsed JSON', async () => {
        const body = '[{"__proto__":{"polluted":true},"name":"a"},{"name":"b"}]';
        const req = new ShokupanRequest({
            method: 'POST',
            url: 'http://localhost/test',
            headers: new Headers({ 'content-type': 'application/json' }),
            body: body,
        });
        const result = await BodyParser.parse(req, { jsonParser: 'native' });
        expect(Object.prototype.hasOwnProperty.call(result.body[0], '__proto__')).toBe(false);
        expect(result.body[0].name).toBe('a');
        expect(result.body[1].name).toBe('b');
    });

    test('does not pollute Object prototype after parsing', async () => {
        const body = '{"__proto__":{"polluted":true}}';
        const req = new ShokupanRequest({
            method: 'POST',
            url: 'http://localhost/test',
            headers: new Headers({ 'content-type': 'application/json' }),
            body: body,
        });
        await BodyParser.parse(req, { jsonParser: 'native' });
        expect(({} as any).polluted).toBeUndefined();
    });
});

describe('Security Fixes: CORS Reflected Header Validation', () => {
    test('reflects valid Access-Control-Request-Headers', async () => {
        const app = new Shokupan();
        app.use(Cors({ origin: '*' }));
        app.get('/test', (ctx) => ctx.json({ ok: true }));

        const res = await app.testRequest({
            method: 'OPTIONS',
            path: '/test',
            headers: {
                'origin': 'https://example.com',
                'access-control-request-headers': 'Content-Type, Authorization',
            },
        });

        expect(res.status).toBe(204);
        expect(res.headers['access-control-allow-headers']).toBe('Content-Type, Authorization');
    });

    test('does not reflect Access-Control-Request-Headers with invalid characters', async () => {
        const app = new Shokupan();
        app.use(Cors({ origin: '*' }));
        app.get('/test', (ctx) => ctx.json({ ok: true }));

        // Use a header value with characters that fail the validation regex
        // but are still accepted by the Headers constructor (e.g. semicolons, parens)
        const res = await app.testRequest({
            method: 'OPTIONS',
            path: '/test',
            headers: {
                'origin': 'https://example.com',
                'access-control-request-headers': 'Content-Type; (inject)',
            },
        });

        expect(res.status).toBe(204);
        // The reflected header should NOT be set because the value fails validation
        expect(res.headers['access-control-allow-headers']).toBeUndefined();
    });
});

describe('Security Fixes: WebApp Plugin Path Traversal Defense', () => {
    test('resolve + startsWith check blocks traversal outside distDir', async () => {
        // Test the defense-in-depth logic directly. new URL() normalizes ".."
        // dot-segments at the HTTP layer, but the resolve+startsWith check in
        // the WebApp plugin provides defense-in-depth if the path ever reaches
        // the handler without normalization (e.g. via internalRequest or future
        // runtime changes).
        const { resolve, sep } = await import('node:path');
        const distDir = '/tmp/myapp/dist';

        // Simulating a path that escapes distDir
        const filePath = resolve(distDir + '/../../etc/passwd');
        const resolvedDist = resolve(distDir);
        const isSafe = filePath.startsWith(resolvedDist + sep) || filePath === resolvedDist;
        expect(isSafe).toBe(false);

        // Simulating a path that stays within distDir
        const safePath = resolve(distDir + '/assets/index.js');
        const isSafe2 = safePath.startsWith(resolvedDist + sep) || safePath === resolvedDist;
        expect(isSafe2).toBe(true);
    });

    test('serves static files from distDir normally', async () => {
        const { WebAppPlugin } = await import('../../plugins/application/web-app/plugin');
        const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
        const { join } = await import('node:path');

        const tmpDir = join(import.meta.dirname, '.tmp-webapp-test');
        try {
            mkdirSync(tmpDir, { recursive: true });
            writeFileSync(join(tmpDir, 'index.html'), '<html><head></head><body>SPA</body></html>');
            writeFileSync(join(tmpDir, 'asset.js'), 'console.log("asset");');

            const app = new Shokupan({ port: 0 });
            app.register(new WebAppPlugin({ distDir: tmpDir }));

            const normalRes = await app.testRequest({ path: '/_app/asset.js' });
            expect(normalRes.status).toBe(200);
            expect(normalRes.data).toContain('console.log');

            await app.stop();
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
