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

const compiledValidators = new WeakMap<any, {
    paths: Map<string, {
        regex: RegExp;
        paramNames: string[];
    }>;
    validators: ValidatorCache;
}>();

export function openApiValidator(): Middleware {
    return async (ctx, next) => {
        const app = ctx.app;
        if (!app || !app.openApiSpec) {
            return next();
        }

        let cache = compiledValidators.get(app);
        if (!cache) {
            cache = compileValidators(app.openApiSpec);
            compiledValidators.set(app, cache);
        }

        let matchPath: string | undefined;
        let matchParams: Record<string, string> = {};

        // Try exact match first
        if (cache.validators.has(ctx.path)) {
            matchPath = ctx.path;
        } else {
            // Regex match
            const pathEntries = Array.from(cache.paths.entries());
            for (let i = 0; i < pathEntries.length; i++) {
                const [path, { regex, paramNames }] = pathEntries[i];
                const match = regex.exec(ctx.path);
                if (match) {
                    matchPath = path;
                    // Extract params
                    paramNames.forEach((name, i) => {
                        matchParams[name] = match[i + 1];
                    });
                    break;
                }
            }
        }

        if (!matchPath) {
            return next();
        }

        const method = ctx.req.method.toLowerCase();
        const validators = cache.validators.get(matchPath)?.[method];
        if (!validators) {
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
            // Merge extracted params with context params (if any)
            // Prioritize context params if router already parsed them, otherwise use matchParams
            const params = { ...matchParams, ...ctx.params };

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

export function compileValidators(spec: any): { paths: Map<string, { regex: RegExp, paramNames: string[]; }>, validators: ValidatorCache; } {
    const validators: ValidatorCache = new Map();
    const paths = new Map<string, { regex: RegExp, paramNames: string[]; }>();

    const pathEntries = Object.entries(spec.paths || {});
    for (let i = 0; i < pathEntries.length; i++) {
        const [path, pathItem] = pathEntries[i];
        // Compile Path Regex
        if (path.includes('{')) {
            const paramNames: string[] = [];
            const regexStr = "^" + path.replace(/{([^}]+)}/g, (_, name) => {
                paramNames.push(name);
                return "([^/]+)";
            }) + "$";
            paths.set(path, {
                regex: new RegExp(regexStr),
                paramNames
            });
        }

        const pathValidators: any = {};

        const methodEntries = Object.entries(pathItem as any);
        for (let k = 0; k < methodEntries.length; k++) {
            const [method, operation] = methodEntries[k];
            if (method === 'parameters' || method === 'summary' || method === 'description') continue;

            const oper = operation as any;
            const opValidators: any = {};

            // 1. Compile Request Body
            if (oper.requestBody?.content?.['application/json']?.schema) {
                opValidators.body = ajv.compile(oper.requestBody.content['application/json'].schema);
            }

            // 2. Compile Parameters (Query, Path, Header)
            const parameters = [...(oper.parameters || []), ...(pathItem as any).parameters || []];

            const queryProps: any = {};
            const pathProps: any = {};
            const headerProps: any = {};
            const queryRequired: string[] = [];
            const pathRequired: string[] = [];
            const headerRequired: string[] = [];

            for (let j = 0; j < parameters.length; j++) {
                const param = parameters[j];
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
                opValidators.query = ajv.compile({
                    type: 'object',
                    properties: queryProps,
                    required: queryRequired.length > 0 ? queryRequired : undefined
                });
            }

            if (Object.keys(pathProps).length > 0) {
                opValidators.params = ajv.compile({
                    type: 'object',
                    properties: pathProps,
                    required: pathRequired.length > 0 ? pathRequired : undefined
                });
            }

            if (Object.keys(headerProps).length > 0) {
                opValidators.headers = ajv.compile({
                    type: 'object',
                    properties: headerProps,
                    required: headerRequired.length > 0 ? headerRequired : undefined
                });
            }

            pathValidators[method] = opValidators;
        }

        validators.set(path, pathValidators);
    }

    return { paths, validators };
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
