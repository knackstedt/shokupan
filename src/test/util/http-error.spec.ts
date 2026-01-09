import { describe, expect, test } from "bun:test";
import { Shokupan } from "../../shokupan";
import { BadRequestError, ForbiddenError, getErrorStatus, HttpError, InternalServerError, NotFoundError, UnauthorizedError } from "../../util/http-error";

describe('HTTP Error Utilities', () => {
    describe('HttpError class', () => {
        test('should create error with status', () => {
            const error = new HttpError('Test error', 418);
            expect(error.message).toBe('Test error');
            expect(error.status).toBe(418);
            expect(error.name).toBe('HttpError');
        });

        test('should maintain stack trace', () => {
            const error = new HttpError('Test error', 500);
            expect(error.stack).toBeDefined();
        });
    });

    describe('getErrorStatus helper', () => {
        test('should extract status from error.status', () => {
            const error = { status: 404, message: 'Not found' };
            expect(getErrorStatus(error)).toBe(404);
        });

        test('should extract statusCode from error.statusCode (backward compatibility)', () => {
            const error = { statusCode: 403, message: 'Forbidden' };
            expect(getErrorStatus(error)).toBe(403);
        });

        test('should prioritize status over statusCode', () => {
            const error = { status: 404, statusCode: 403, message: 'Conflict' };
            expect(getErrorStatus(error)).toBe(404);
        });

        test('should default to 500 for errors without status', () => {
            const error = new Error('Generic error');
            expect(getErrorStatus(error)).toBe(500);
        });

        test('should default to 500 for null/undefined', () => {
            expect(getErrorStatus(null)).toBe(500);
            expect(getErrorStatus(undefined)).toBe(500);
            expect(getErrorStatus({})).toBe(500);
        });
    });

    describe('Named error classes', () => {
        test('BadRequestError should have status 400', () => {
            const error = new BadRequestError();
            expect(error.status).toBe(400);
            expect(error.message).toBe('Bad Request');
            expect(error.name).toBe('BadRequestError');
        });

        test('BadRequestError should accept custom message', () => {
            const error = new BadRequestError('Invalid input');
            expect(error.status).toBe(400);
            expect(error.message).toBe('Invalid input');
        });

        test('UnauthorizedError should have status 401', () => {
            const error = new UnauthorizedError();
            expect(error.status).toBe(401);
            expect(error.message).toBe('Unauthorized');
        });

        test('ForbiddenError should have status 403', () => {
            const error = new ForbiddenError();
            expect(error.status).toBe(403);
            expect(error.message).toBe('Forbidden');
        });

        test('NotFoundError should have status 404', () => {
            const error = new NotFoundError();
            expect(error.status).toBe(404);
            expect(error.message).toBe('Not Found');
        });

        test('InternalServerError should have status 500', () => {
            const error = new InternalServerError();
            expect(error.status).toBe(500);
            expect(error.message).toBe('Internal Server Error');
        });
    });

    describe('Integration with Shokupan', () => {
        test('should handle HttpError in route handler', async () => {
            const app = new Shokupan();

            app.get('/test-error', () => {
                throw new NotFoundError('Resource not found');
            });

            const res = await app.testRequest({ url: 'http://localhost/test-error' });
            expect(res.status).toBe(404);
            expect(res.data.error).toBe('Resource not found');
        });

        test('should handle error with statusCode (backward compatibility)', async () => {
            const app = new Shokupan();

            app.get('/legacy-error', () => {
                const err: any = new Error('Old style error');
                err.statusCode = 422;
                throw err;
            });

            const res = await app.testRequest({ url: 'http://localhost/legacy-error' });
            expect(res.status).toBe(422);
            expect(res.data.error).toBe('Old style error');
        });

        test('should handle error with both status and statusCode', async () => {
            const app = new Shokupan();

            app.get('/dual-error', () => {
                const err: any = new Error('Dual prop error');
                err.status = 409;
                err.statusCode = 422; // Should be ignored, status takes precedence
                throw err;
            });

            const res = await app.testRequest({ url: 'http://localhost/dual-error' });
            expect(res.status).toBe(409);
            expect(res.data.error).toBe('Dual prop error');
        });

        test('should default to 500 for generic errors', async () => {
            const app = new Shokupan();

            app.get('/generic-error', () => {
                throw new Error('No status property');
            });

            const res = await app.testRequest({ url: 'http://localhost/generic-error' });
            expect(res.status).toBe(500);
            expect(res.data.error).toBe('No status property');
        });

        test('should propagate error.errors array', async () => {
            const app = new Shokupan();

            app.get('/validation-error', () => {
                const err: any = new BadRequestError('Validation failed');
                err.errors = [
                    { field: 'email', message: 'Invalid email' },
                    { field: 'password', message: 'Too short' }
                ];
                throw err;
            });

            const res = await app.testRequest({ url: 'http://localhost/validation-error' });
            expect(res.status).toBe(400);
            expect(res.data.error).toBe('Validation failed');
            expect(res.data.errors).toHaveLength(2);
            expect(res.data.errors[0].field).toBe('email');
        });
    });
});
