import { describe, expect, test } from "bun:test";
import { Shokupan } from "../../shokupan";
import {
    BadRequestError,
    ForbiddenError
} from "../../util/http-error";

describe('Automatic Status Codes', () => {

    test('should return 200 OK for implicit success (string)', async () => {
        const app = new Shokupan();
        app.get('/', (ctx) => 'Hello World');

        const res = await app.testRequest({ url: 'http://localhost/' });
        expect(res.status).toBe(200);
        expect(res.data).toBe('Hello World');
    });

    test('should return 200 OK for implicit success (object/json)', async () => {
        const app = new Shokupan();
        app.get('/', (ctx) => ({ message: 'Hello World' }));

        const res = await app.testRequest({ url: 'http://localhost/' });
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ message: 'Hello World' });
    });

    test('should return 204 No Content for void/undefined return', async () => {
        const app = new Shokupan();
        app.get('/', (ctx) => {
            // implicit return undefined
        });

        const res = await app.testRequest({ url: 'http://localhost/' });
        expect(res.status).toBe(204);
        expect(res.data).toBe('');
    });

    test('should return 204 No Content when explicitly set', async () => {
        const app = new Shokupan();
        app.get('/', (ctx) => {
            return ctx.status(204);
        });

        const res = await app.testRequest({ url: 'http://localhost/' });
        expect(res.status).toBe(204);
        expect(res.data).toBe('');
    });

    test('should return 201 Created when explicitly set', async () => {
        const app = new Shokupan();
        app.get('/', (ctx) => {
            return ctx.status(201);
        });

        const res = await app.testRequest({ url: 'http://localhost/' });
        expect(res.status).toBe(201);
    });

    test('should return 404 Not Found for missing route', async () => {
        const app = new Shokupan();
        // No routes defined

        const res = await app.testRequest({ url: 'http://localhost/missing' });
        expect(res.status).toBe(404);
    });

    test('should return 500 Internal Server Error for uncaught exception', async () => {
        const app = new Shokupan();
        app.get('/', (ctx) => {
            throw new Error('Something exploded');
        });

        const res = await app.testRequest({ url: 'http://localhost/' });
        expect(res.status).toBe(500);
        const body = await res.data;
        expect(body.error).toBe('Something exploded');
    });

    test('should return custom status code for Error with status property', async () => {
        const app = new Shokupan();
        app.get('/', (ctx) => {
            const err: any = new Error('Bad Input');
            err.status = 400;
            throw err;
        });

        const res = await app.testRequest({ url: 'http://localhost/' });
        expect(res.status).toBe(400);
        const body = await res.data;
        expect(body.error).toBe('Bad Input');
    });

    test('should return custom status code for Error with statusCode property', async () => {
        const app = new Shokupan();
        app.get('/', (ctx) => {
            const err: any = new Error('Access Denied');
            err.statusCode = 403;
            throw err;
        });

        const res = await app.testRequest({ url: 'http://localhost/' });
        expect(res.status).toBe(403);
        const body = await res.data;
        expect(body.error).toBe('Access Denied');
    });

    test('should return correct status code for Shokupan HttpError types', async () => {
        const app = new Shokupan();

        app.get('/bad', (ctx) => {
            throw new BadRequestError('Invalid params');
        });

        app.get('/forbidden', (ctx) => {
            throw new ForbiddenError('No go');
        });

        const resBad = await app.testRequest({ url: 'http://localhost/bad' });
        expect(resBad.status).toBe(400);
        expect((await resBad.data).error).toBe('Invalid params');

        const resForbidden = await app.testRequest({ url: 'http://localhost/forbidden' });
        expect(resForbidden.status).toBe(403);
        expect((await resForbidden.data).error).toBe('No go');
    });

    test('should return 400 for JSON parse errors (simulated)', async () => {
        const app = new Shokupan();
        app.get('/', (ctx) => {
            // Simulating a JSON parse error which might happen during body parsing
            throw new SyntaxError('Unexpected token } in JSON at position 0');
        });

        const res = await app.testRequest({ url: 'http://localhost/' });
        expect(res.status).toBe(400);
    });
});
