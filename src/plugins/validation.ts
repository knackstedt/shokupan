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
    const req = ctx.req as any;

    // Check if already parsed
    if (req._bodyParsed) {
        return req._bodyValue;
    }

    try {
        let data: any;
        // Standard Request consumes stream
        // ShokupanRequest (internal) has properties
        if (typeof req.json === 'function') {
            data = await req.json();
        }
        else {
            // Fallback if req is plain object with body property (internal usage)
            data = req.body;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch { }
            }
        }

        // Cache it
        req._bodyParsed = true;
        req._bodyValue = data;

        // Monkey patch json() to return cached data
        // This ensures subsequent calls (e.g. in handlers) get the same data
        // and don't fail due to stream locked
        Object.defineProperty(req, 'json', {
            value: async () => req._bodyValue,
            configurable: true
        });

        return data;
    } catch (e) {
        return {}; // Return empty object if parsing fails (flexible)
    }
};


// --- Main Middleware ---

export function validate(config: ValidationConfig): Middleware {
    return async (ctx: ShokupanContext, next) => {
        // Validate Params
        if (config.params) {
            ctx.params = await runValidation(config.params, ctx.params);
        }

        // Validate Query
        if (config.query) {
            const url = new URL(ctx.req.url);
            const queryObj = Object.fromEntries(url.searchParams.entries());
            const validQuery = await runValidation(config.query, queryObj);
            // We can't easily replace ctx.query as it is likely a getter wrapping URL
            // But we can store it in state
            // Or try to update URL search params?
            // If validation coerced types (e.g. string -> number), updating URL search params converts back to string.
            // So we attach to state.
            // (ctx.state as any).query = validQuery;
        }

        // Validate Headers
        if (config.headers) {
            const headersObj = Object.fromEntries(ctx.req.headers.entries());
            await runValidation(config.headers, headersObj);
        }

        // Validate Body
        if (config.body) {
            const body = await safelyGetBody(ctx);
            const validBody = await runValidation(config.body, body);

            // Update cached body with validated/sanitized version
            const req = ctx.req as any;
            req._bodyValue = validBody;

            // Ensure json() returns the validated body
            Object.defineProperty(req, 'json', {
                value: async () => validBody,
                configurable: true
            });

            (ctx as any).body = validBody; // Legacy/Convenience
        }

        return next();
    };
}

async function runValidation(schema: any, data: any): Promise<any> {
    if (isZod(schema)) {
        return validateZod(schema, data);
    }
    if (isTypeBox(schema)) {
        return validateTypeBox(schema, data);
    }
    if (isAjv(schema)) {
        return validateAjv(schema, data);
    }
    if (isValibotWrapper(schema)) {
        return validateValibotWrapper(schema, data);
    }

    // Check custom function first? Or check Class first?
    // isClass might yield true for simple functions if our check is loose.
    // But if we use class-syntax check it's safer.
    // Let's try isClass specific check.
    if (isClass(schema)) {
        return validateClassValidator(schema, data);
    }
    if (isTypeBox(schema)) {
        return validateTypeBox(schema, data);
    }
    if (isAjv(schema)) {
        return validateAjv(schema, data);
    }
    if (isValibotWrapper(schema)) {
        return validateValibotWrapper(schema, data);
    }

    if (typeof schema === 'function') {
        return schema(data);
    }

    throw new Error("Unknown validator type provided. Please use a supported library (Zod, Ajv, TypeBox) or a custom function.");
}
