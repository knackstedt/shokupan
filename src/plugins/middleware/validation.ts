// Lazy-loaded dependencies
let plainToInstance: any;
let validateOrReject: any;
import { ShokupanContext } from "../../context";
import type { Middleware } from "../../util/types";

const $cachedBody = Symbol.for("Shokupan.ctx.cachedBody");

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

function isRawTypeBox(schema: any): boolean {
    return schema && typeof schema === 'object' && !!schema[Symbol.for('TypeBox.Kind')];
}

let TypeCompiler: any;

async function getTypeCompiler() {
    if (!TypeCompiler) {
        TypeCompiler = (await import('@sinclair/typebox/compiler')).TypeCompiler;
    }
    return TypeCompiler;
}

const compiledTypeBoxCache = new WeakMap<any, any>();

async function compileTypeBox(schema: any) {
    let compiled = compiledTypeBoxCache.get(schema);
    if (!compiled) {
        const TC = await getTypeCompiler();
        compiled = TC.Compile(schema);
        compiledTypeBoxCache.set(schema, compiled);
    }
    return compiled;
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
    // Lazy load dependencies
    if (!plainToInstance || !validateOrReject) {
        try {
            const ct = await import('class-transformer');
            const cv = await import('class-validator');
            plainToInstance = ct.plainToInstance;
            validateOrReject = cv.validateOrReject;
        } catch (e) {
            throw new Error(
                'class-transformer and class-validator are required for class-based validation. ' +
                'Install them with: bun add class-transformer class-validator reflect-metadata'
            );
        }
    }

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

function getValidator(schema: any): (data: any) => Promise<any> | any {
    if (isZod(schema)) {
        return (data) => validateZod(schema, data);
    }
    if (isTypeBox(schema)) {
        return (data) => validateTypeBox(schema, data);
    }
    if (isRawTypeBox(schema)) {
        // Return a function that lazily compiles and validates on first use
        let compiled: any;
        return async (data: any) => {
            if (!compiled) {
                compiled = await compileTypeBox(schema);
            }
            return validateTypeBox(compiled, data);
        };
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

/**
 * Validation middleware.
 * @param config Validation configuration
 * @returns Middleware function
 */
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
        await ctx.app?.runHooks('beforeValidate', ctx, dataToValidate);

        // Validate Params
        if (validators.params) {
            ctx.params = await validators.params(ctx.params);
        }

        // Validate Query
        let validQuery: any;
        if (validators.query && queryObj) {
            validQuery = await validators.query(queryObj);
            Object.defineProperty(ctx, 'query', {
                value: validQuery,
                writable: true,
                configurable: true
            });
        }

        // Validate Headers
        let validHeaders: any;
        if (validators.headers) {
            const headersObj = Object.fromEntries(ctx.req.headers.entries());
            validHeaders = await validators.headers(headersObj);
            Object.defineProperty(ctx, 'headers', {
                value: new Headers(validHeaders),
                writable: true,
                configurable: true
            });
        }

        // Validate Body
        let validBody: any;
        if (validators.body) {
            // Re-use body accessed above or get again (it's cached)
            const b = body ?? await safelyGetBody(ctx);
            validBody = await validators.body(b);

            // Update context's cached body with validated/transformed version
            (ctx as any)[$cachedBody] = validBody;

            // Monkey-patch ctx.body() to return the validated body synchronously
            // This ensures handlers can call ctx.body() without await after validation
            (ctx as any).body = () => validBody;

            // Monkey-patch req.json() to return the validated body
            // This ensures handlers can call ctx.req.json() and get the validated data
            const req = ctx.req as any;
            Object.defineProperty(req, 'json', {
                value: async () => validBody,
                writable: true,
                configurable: true
            });
        }

        // Call afterValidate Hook
        const validatedData: any = { ...dataToValidate };
        if (config.params) validatedData.params = ctx.params;
        if (config.query) validatedData.query = validQuery;
        if (config.headers) validatedData.headers = validHeaders;
        if (config.body) validatedData.body = validBody;

        await ctx.app?.runHooks('afterValidate', ctx, validatedData);

        return next();
    };
}
