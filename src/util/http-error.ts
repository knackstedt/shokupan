/**
 * Standard HTTP Error class with status code.
 * This standardizes on the `status` property instead of dual `status`/`statusCode`.
 */
export class HttpError extends Error {
    public readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'HttpError';
        this.status = status;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, HttpError);
        }
    }
}

/**
 * Extracts HTTP status code from an error object.
 * Supports both `status` and `statusCode` properties for backward compatibility.
 * Defaults to 500 (Internal Server Error) if no status is found.
 * 
 * @param err - Error object (may have `status` or `statusCode` property)
 * @returns HTTP status code
 */
export function getErrorStatus(err: any): number {
    // Handle null/undefined
    if (!err || typeof err !== 'object') {
        return 500;
    }

    // Prioritize `status` over `statusCode` to encourage standardization
    if (typeof err.status === 'number') {
        return err.status;
    }
    if (typeof err.statusCode === 'number') {
        return err.statusCode;
    }
    // Default to 500 Internal Server Error
    return 500;
}

/**
 * Common HTTP Errors
 */

export class BadRequestError extends HttpError {
    constructor(message: string = 'Bad Request') {
        super(message, 400);
        this.name = 'BadRequestError';
    }
}

export class UnauthorizedError extends HttpError {
    constructor(message: string = 'Unauthorized') {
        super(message, 401);
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends HttpError {
    constructor(message: string = 'Forbidden') {
        super(message, 403);
        this.name = 'ForbiddenError';
    }
}

export class NotFoundError extends HttpError {
    constructor(message: string = 'Not Found') {
        super(message, 404);
        this.name = 'NotFoundError';
    }
}

export class InternalServerError extends HttpError {
    constructor(message: string = 'Internal Server Error') {
        super(message, 500);
        this.name = 'InternalServerError';
    }
}
