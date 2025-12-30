import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { Middleware } from "../types";
import { ValidationError } from "./validation";

const ajv = new Ajv({ coerceTypes: true, allErrors: true });
addFormats(ajv);

type ValidatorCache = Map<string, {
    [method: string]: {
        body?: import("ajv").ValidateFunction;
        query?: import("ajv").ValidateFunction;
        params?: import("ajv").ValidateFunction;
        headers?: import("ajv").ValidateFunction;
    };
}>;

// WeakMap to store compiled validators per application instance
const compiledValidators = new WeakMap<any, ValidatorCache>();

export function openApiValidator(): Middleware {
    return async (ctx, next) => {
        const app = ctx.app;
        if (!app || !app.openApiSpec) {
            // No spec available, skip validation
            return next();
        }

        let cache = compiledValidators.get(app);
        if (!cache) {
            cache = compileValidators(app.openApiSpec);
            compiledValidators.set(app, cache);
        }

        // Match request to OpenAPI path
        const method = ctx.req.method.toLowerCase();

        // Find the matching path in the spec
        // The spec paths are like /users/{id}
        // The request path is like /users/123
        // We need to find which spec path matches ctx.path

        // Optimization: Checking against route definition if available?
        // But the middleware matches before router dispatch usually? 
        // Actually, if we use this middleware at app level, we don't know the route yet.
        // But wait, the OpenAPI spec mirrors the defined routes.

        // Simple matcher:
        // iterate all keys in cache (which are paths), convert {param} to regex, and match.
        // This is O(N) where N is number of routes. Acceptable for now.
        // A better approach would be to have the Router inject the matched spec path, but we are a plugin.

        let matchPath: string | undefined;
        let matchParams: Record<string, string> = {};

        // Try exact match first
        if (cache.has(ctx.path)) {
            matchPath = ctx.path;
        } else {
            // Regex match
            for (const specPath of cache.keys()) {
                // Convert /users/{id} to ^/users/([^/]+)$
                // This is a naive implementation, ideally we reuse router's logic or pre-compile regexes
                const regexStr = "^" + specPath.replace(/{([^}]+)}/g, "([^/]+)") + "$";
                const regex = new RegExp(regexStr);
                const match = regex.exec(ctx.path);

                if (match) {
                    matchPath = specPath;
                    break;
                }
            }
        }

        if (!matchPath) {
            // Path not found in spec, skip validation (or 404?)
            return next();
        }

        const validators = cache.get(matchPath)?.[method];
        if (!validators) {
            // Method not allowed or not in spec
            // Let the router handle 405 or 404
            return next();
        }

        const errors: any[] = [];

        if (validators.body) {
            let body: any;
            try {
                body = await ctx.req.json().catch(() => ({}));
            } catch {
                body = {};
            }
            const valid = validators.body(body);
            if (!valid && validators.body.errors) {
                errors.push(...validators.body.errors.map(e => ({ ...e, location: 'body' })));
            }
        }

        // Validate Query
        if (validators.query) {
            const query = Object.fromEntries(new URL(ctx.req.url).searchParams.entries());
            const valid = validators.query(query);
            if (!valid && validators.query.errors) {
                errors.push(...validators.query.errors.map(e => ({ ...e, location: 'query' })));
            }
        }

        // Validate Params
        if (validators.params) {
            // We need to extract params again because we matched manually or rely on Router?
            // If the router matched, ctx.params is set.
            // But this middleware might run BEFORE router dispatch if added via app.use().
            // If it matches BEFORE router, ctx.params is empty.
            // We need to parse params based on the matchPath.

            let params = ctx.params;
            if (Object.keys(params).length === 0 && matchPath) {
                const paramNames = (matchPath.match(/{([^}]+)}/g) || []).map(s => s.slice(1, -1));
                if (paramNames.length > 0) {
                    const regexStr = "^" + matchPath.replace(/{([^}]+)}/g, "([^/]+)") + "$";
                    const regex = new RegExp(regexStr);
                    const match = regex.exec(ctx.path);
                    if (match) {
                        params = {};
                        paramNames.forEach((name, i) => {
                            params[name] = match[i + 1];
                        });
                        // Update context params? Maybe not matching side-effects
                        // ctx.params = params; 
                    }
                }
            }

            const valid = validators.params(params);
            if (!valid && validators.params.errors) {
                errors.push(...validators.params.errors.map(e => ({ ...e, location: 'path' })));
            }
        }

        // Validate Headers
        if (validators.headers) {
            const headers = Object.fromEntries(ctx.req.headers.entries());
            // Headers in OpenAPI are case-insensitive usually, but schema keys are sensitive?
            // Typically headers schema property names are lowercased.
            const valid = validators.headers(headers);
            if (!valid && validators.headers.errors) {
                errors.push(...validators.headers.errors.map(e => ({ ...e, location: 'header' })));
            }
        }

        if (errors.length > 0) {
            throw new ValidationError(errors);
        }

        return next();
    };
}

export function compileValidators(spec: any): ValidatorCache {
    const cache: ValidatorCache = new Map();

    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
        const pathValidators: any = {};

        for (const [method, operation] of Object.entries(pathItem as any)) {
            if (method === 'parameters' || method === 'summary' || method === 'description') continue;

            const oper = operation as any;
            const validators: any = {};

            // 1. Compile Request Body
            if (oper.requestBody?.content?.['application/json']?.schema) {
                validators.body = ajv.compile(oper.requestBody.content['application/json'].schema);
            }

            // 2. Compile Parameters (Query, Path, Header)
            const parameters = [...(oper.parameters || []), ...(pathItem as any).parameters || []];

            const queryProps: any = {};
            const pathProps: any = {};
            const headerProps: any = {};
            const queryRequired: string[] = [];
            const pathRequired: string[] = [];
            const headerRequired: string[] = [];

            for (const param of parameters) {
                if (param.in === 'query') {
                    queryProps[param.name] = param.schema || {};
                    if (param.required) queryRequired.push(param.name);
                } else if (param.in === 'path') {
                    pathProps[param.name] = param.schema || {};
                    pathRequired.push(param.name);
                } else if (param.in === 'header') {
                    headerProps[param.name] = param.schema || {};
                    if (param.required) headerRequired.push(param.name);
                }
            }

            if (Object.keys(queryProps).length > 0) {
                validators.query = ajv.compile({
                    type: 'object',
                    properties: queryProps,
                    required: queryRequired.length > 0 ? queryRequired : undefined
                });
            }

            if (Object.keys(pathProps).length > 0) {
                validators.params = ajv.compile({
                    type: 'object',
                    properties: pathProps,
                    required: pathRequired.length > 0 ? pathRequired : undefined
                });
            }

            if (Object.keys(headerProps).length > 0) {
                validators.headers = ajv.compile({
                    type: 'object',
                    properties: headerProps,
                    required: headerRequired.length > 0 ? headerRequired : undefined
                });
            }

            pathValidators[method] = validators;
        }

        cache.set(path, pathValidators);
    }

    return cache;
}

/**
 * Pre-compiles validators for the application using the provided spec.
 * Should be called when the spec is available.
 */
export function precompileValidators(app: any, spec: any) {
    const cache = compileValidators(spec);
    compiledValidators.set(app, cache);
}

/**
 * Enables OpenAPI validation for the application.
 * This registers the middleware and the hook to pre-compile validators when the spec is generated.
 * 
 * @param app The Shokupan application instance
 */
export function enableOpenApiValidation(app: import("../shokupan").Shokupan) {
    app.use(openApiValidator());
    app.onSpecAvailable((spec) => {
        precompileValidators(app, spec);
    });
}
