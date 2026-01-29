
import { describe, expect, it } from "bun:test";
import { Shokupan } from "./shokupan";

class CustomError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CustomError';
    }
}

class AnotherError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AnotherError';
    }
}

describe("Centralized Error Handling", () => {
    it("should catch specific errors with registered handler", async () => {
        const app = new Shokupan();

        app.onStrictError(CustomError, (err, ctx) => {
            return ctx.json({ error: 'Caught CustomError', message: err.message }, 400);
        });

        app.get('/error', () => {
            throw new CustomError('Something went wrong');
        });

        const res = await app.testRequest({ path: '/error' });
        expect(res.status).toBe(400);
        expect(res.data).toEqual({ error: 'Caught CustomError', message: 'Something went wrong' });
    });

    it("should fall back to default handler if no match", async () => {
        const app = new Shokupan();

        app.onStrictError(CustomError, (err, ctx) => {
            return ctx.json({ error: 'Caught CustomError' }, 400);
        });

        app.get('/generic-error', () => {
            throw new Error('Generic error');
        });

        const res = await app.testRequest({ path: '/generic-error' });
        expect(res.status).toBe(500);
        expect(res.data.error).toBe('Generic error');
    });

    it("should handle error inheritance correctly", async () => {
        const app = new Shokupan();

        // Handler for base Error class
        app.onStrictError(Error, (err, ctx) => {
            return ctx.json({ error: 'Caught Generic Error' }, 500);
        });

        app.get('/custom-error-inheritance', () => {
            // CustomError extends Error, so it should be caught by Error handler if no specific handler
            throw new CustomError('Inherited error');
        });

        const res = await app.testRequest({ path: '/custom-error-inheritance' });
        expect(res.status).toBe(500);
        expect(res.data).toEqual({ error: 'Caught Generic Error' });
    });

    it("should respect registration order (LIFO)", async () => {
        const app = new Shokupan();

        // First registration
        app.onStrictError(Error, (err, ctx) => {
            return ctx.json({ handler: 'first' }, 500);
        });

        // Second registration (should take precedence)
        app.onStrictError(Error, (err, ctx) => {
            return ctx.json({ handler: 'second' }, 500);
        });

        app.get('/order', () => {
            throw new Error('test');
        });

        const res = await app.testRequest({ path: '/order' });
        expect(res.status).toBe(500);
        expect(res.data).toEqual({ handler: 'second' });
    });

    it("should handle error in error handler gracefully", async () => {
        const app = new Shokupan();

        app.onStrictError(CustomError, (err, ctx) => {
            throw new Error('Error inside handler');
        });

        app.get('/handler-error', () => {
            throw new CustomError('Trigger');
        });

        // Should fall back to default 500
        const res = await app.testRequest({ path: '/handler-error' });
        expect(res.status).toBe(500);
        // The original error "Trigger" might be lost or obscured by "Error inside handler", 
        // but our implementation logs the inner error and continues with the NEW error? 
        // Actually code says: err = handlerErr; break; so it falls through with new error.
        expect(res.data.error).toBe('Error inside handler');
    });
});
