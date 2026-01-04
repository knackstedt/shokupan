import { plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
import { ShokupanContext } from "../context";
import type { Middleware } from "../types";

export interface ValidationConfig {
    body?: any;
    query?: any;
    params?: any;
    headers?: any;
}

export class ValidationError extends Error {
    public status = 400;
    constructor(public errors: any[]) {
        super("Validation Error");
    }
}

// --- Adapters ---

function isZod(schema: any): boolean {
    return typeof schema?.safeParse === 'function';
}

async function validateZod(schema: any, data: any) {
    const result = await schema.safeParseAsync(data);
    if (!result.success) {
        throw new ValidationError(result.error.errors);
    }
    return result.data;
}

function isTypeBox(schema: any): boolean {
    return typeof schema?.Check === 'function' && typeof schema?.Errors === 'function';
}

function validateTypeBox(schema: any, data: any) {
    if (!schema.Check(data)) {
        throw new ValidationError([...schema.Errors(data)]);
    }
    return data;
}

function isAjv(schema: any): boolean {
    return typeof schema === 'function' && 'errors' in schema;
}

function validateAjv(schema: any, data: any) {
    const valid = schema(data);
    if (!valid) {
        throw new ValidationError(schema.errors);
    }
    return data;
}

export const valibot = (schema: any, parser: Function) => {
    return {
        _valibot: true,
        schema,
        parser
    };
};

function isValibotWrapper(schema: any): boolean {
    return schema?._valibot === true;
}

async function validateValibotWrapper(wrapper: any, data: any) {
    const result = await wrapper.parser(wrapper.schema, data);
    if (!result.success) {
        throw new ValidationError(result.issues);
    }
    return result.output;
}

function isClass(schema: any): boolean {
    // Check if it's a constructor for a class
    // Usually classes have names and are functions, but plain functions are also functions.
    // A robust check for a class constructor (especially with decorators) is tricky but checking for prototype 
    // and if it looks like a constructor is a start.
    // However, for class-validator/transformer usages, compiling consumers typically pass the class Constructor.
    try {
        if (typeof schema === 'function' && /^\s*class\s+/.test(schema.toString())) {
            return true;
        }
        // Fallback for some complied outputs or if it just has a name and prototype
        // But we want to avoid treating `z.string()` (which might yield a function?) 
        // actually Zod schemas are objects. Custom validation functions are functions.
        // We can assume if the user passes a class constructor it intends for class-validator.
        return typeof schema === 'function' && schema.prototype && schema.name;
    } catch {
        return false;
    }
}

async function validateClassValidator(schema: any, data: any) {
    // Transform plain object to class instance
    const object = plainToInstance(schema, data);
    try {
        await validateOrReject(object as any);
        return object;
    } catch (errors: any) {
        // Flatten errors or just return them
        // class-validator returns Array<ValidationError>
        // We'll wrap in our ValidationError
        const formattedErrors = Array.isArray(errors)
            ? errors.map((err: any) => ({
                property: err.property,
                constraints: err.constraints,
                children: err.children
            }))
            : errors;

        throw new ValidationError(formattedErrors);
    }
}


// --- Body Helper ---

const safelyGetBody = async (ctx: ShokupanContext) => {
    // Use context's built-in body caching mechanism
    try {
        return await ctx.body();
    } catch (e) {
        return {}; // Return empty object if parsing fails (flexible)
    }
};


// --- Main Middleware ---

// --- Main Middleware ---

function getValidator(schema: any): (data: any) => Promise<any> | any {
    if (isZod(schema)) {
        return (data) => validateZod(schema, data);
    }
    if (isTypeBox(schema)) {
        return (data) => validateTypeBox(schema, data);
    }
    if (isAjv(schema)) {
        return (data) => validateAjv(schema, data);
    }
    if (isValibotWrapper(schema)) {
        return (data) => validateValibotWrapper(schema, data);
    }
    if (isClass(schema)) {
        return (data) => validateClassValidator(schema, data);
    }
    if (typeof schema === 'function') {
        return schema;
    }
    throw new Error("Unknown validator type provided. Please use a supported library (Zod, Ajv, TypeBox) or a custom function.");
}

export function validate(config: ValidationConfig): Middleware {
    // Pre-compilation: Resolve validators for each part
    const validators: {
        params?: (data: any) => any;
        query?: (data: any) => any;
        headers?: (data: any) => any;
        body?: (data: any) => any;
    } = {};

    if (config.params) validators.params = getValidator(config.params);
    if (config.query) validators.query = getValidator(config.query);
    if (config.headers) validators.headers = getValidator(config.headers);
    if (config.body) validators.body = getValidator(config.body);

    return async (ctx: ShokupanContext, next) => {
        // Prepare data for beforeValidate hook
        const dataToValidate: any = {};
        if (config.params) dataToValidate.params = ctx.params;
        let queryObj: Record<string, string> | undefined;
        if (config.query) {
            const url = new URL(ctx.req.url);
            queryObj = Object.fromEntries(url.searchParams.entries());
            dataToValidate.query = queryObj;
        }
        if (config.headers) dataToValidate.headers = Object.fromEntries(ctx.req.headers.entries());

        let body: any;
        if (config.body) {
            body = await safelyGetBody(ctx);
            dataToValidate.body = body;
        }

        // Call beforeValidate Hook
        if (ctx.app?.hasHook('beforeValidate')) {
            await ctx.app.executeHook('beforeValidate', ctx, dataToValidate);
        }

        // Validate Params
        if (validators.params) {
            ctx.params = await validators.params(ctx.params);
        }

        // Validate Query
        let validQuery: any;
        if (validators.query && queryObj) {
            validQuery = await validators.query(queryObj);
        }

        // Validate Headers
        if (validators.headers) {
            const headersObj = Object.fromEntries(ctx.req.headers.entries());
            await validators.headers(headersObj);
        }

        // Validate Body
        let validBody: any;
        if (validators.body) {
            // Re-use body accessed above or get again (it's cached)
            const b = body ?? await safelyGetBody(ctx);
            validBody = await validators.body(b);

            // Update context's cached body with validated/transformed version
            (ctx as any)._cachedBody = validBody;

            // Monkey-patch req.json() to return the validated body
            // This ensures handlers can call ctx.req.json() and get the validated data
            const req = ctx.req as any;
            Object.defineProperty(req, 'json', {
                value: async () => validBody,
                writable: true,
                configurable: true
            });

            (ctx as any).body = validBody; // Legacy/Convenience
        }

        // Call afterValidate Hook
        if (ctx.app?.hasHook('afterValidate')) {
            const validatedData: any = { ...dataToValidate };
            if (config.params) validatedData.params = ctx.params;
            if (config.query) validatedData.query = validQuery;
            if (config.body) validatedData.body = validBody;

            await ctx.app?.executeHook('afterValidate', ctx, validatedData);
        }

        return next();
    };
}
