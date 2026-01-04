import type { ShokupanRouter } from '../router';
import { $childControllers, $childRouters, $mountPath, $routes } from '../symbol';
import type { OpenAPIOptions, ShokupanHandler } from '../types';
import { deepMerge } from '../util/deep-merge';

/**
 * Analyze a handler function to infer request/response types
 */
const REGEX_QUERY_INT = /parseInt\(ctx\.query\.(\w+)\)/g;
const REGEX_QUERY_FLOAT = /parseFloat\(ctx\.query\.(\w+)\)/g;
const REGEX_QUERY_NUMBER = /Number\(ctx\.query\.(\w+)\)/g;
const REGEX_QUERY_BOOL = /(?:Boolean\(ctx\.query\.(\w+)\)|!+ctx\.query\.(\w+))/g;
const REGEX_QUERY_GENERIC = /ctx\.query\.(\w+)/g;
const REGEX_PARAM_INT = /parseInt\(ctx\.params\.(\w+)\)/g;
const REGEX_PARAM_FLOAT = /parseFloat\(ctx\.params\.(\w+)\)/g;
const REGEX_PARAM_GENERIC = /ctx\.params\.(\w+)/;
const REGEX_HEADER_GET = /ctx\.get\(['"](\w+)['"]\)/g;
const REGEX_ERROR_STATUS = /ctx\.(?:json|text|html)\([^)]+,\s*(\d{3,})\)/g;

/**
 * Analyze a handler function to infer request/response types
 */
function analyzeHandler(handler: ShokupanHandler): { inferredSpec?: any; } {
    const handlerSource = handler.toString();
    const inferredSpec: any = {};

    // Detect request body
    if (handlerSource.includes('ctx.body') || handlerSource.includes('await ctx.req.json()')) {
        inferredSpec.requestBody = {
            content: { 'application/json': { schema: { type: 'object' } } }
        };
    }

    const queryParams = new Map<string, { type: string; format?: string; }>();

    // Query Integers
    const queryIntMatches = Array.from(handlerSource.matchAll(REGEX_QUERY_INT));
    for (let i = 0; i < queryIntMatches.length; i++) {
        const match = queryIntMatches[i];
        if (match[1]) queryParams.set(match[1], { type: 'integer', format: 'int32' });
    }

    // Query Floats
    const queryFloatMatches = Array.from(handlerSource.matchAll(REGEX_QUERY_FLOAT));
    for (let i = 0; i < queryFloatMatches.length; i++) {
        const match = queryFloatMatches[i];
        if (match[1]) queryParams.set(match[1], { type: 'number', format: 'float' });
    }

    // Query Numbers
    const queryNumberMatches = Array.from(handlerSource.matchAll(REGEX_QUERY_NUMBER));
    for (let i = 0; i < queryNumberMatches.length; i++) {
        const match = queryNumberMatches[i];
        if (match[1] && !queryParams.has(match[1])) {
            queryParams.set(match[1], { type: 'number' });
        }
    }

    // Query Booleans
    const queryBoolMatches = Array.from(handlerSource.matchAll(REGEX_QUERY_BOOL));
    for (let i = 0; i < queryBoolMatches.length; i++) {
        const match = queryBoolMatches[i];
        const name = match[1] || match[2];
        if (name && !queryParams.has(name)) {
            queryParams.set(name, { type: 'boolean' });
        }
    }

    // Generic Query Strings
    const queryGenericMatches = Array.from(handlerSource.matchAll(REGEX_QUERY_GENERIC));
    for (let i = 0; i < queryGenericMatches.length; i++) {
        const match = queryGenericMatches[i];
        const name = match[1];
        if (name && !queryParams.has(name)) {
            queryParams.set(name, { type: 'string' });
        }
    }

    if (queryParams.size > 0) {
        if (!inferredSpec.parameters) inferredSpec.parameters = [];
        queryParams.forEach((schema, paramName) => {
            inferredSpec.parameters.push({
                name: paramName,
                in: 'query',
                schema: { type: schema.type, ...(schema.format ? { format: schema.format } : {}) }
            });
        });
    }

    const pathParams = new Map<string, { type: string; format?: string; }>();

    // Path Integers
    const paramIntMatches = Array.from(handlerSource.matchAll(REGEX_PARAM_INT));
    for (let i = 0; i < paramIntMatches.length; i++) {
        const match = paramIntMatches[i];
        if (match[1]) pathParams.set(match[1], { type: 'integer', format: 'int32' });
    }

    // Path Floats
    const paramFloatMatches = Array.from(handlerSource.matchAll(REGEX_PARAM_FLOAT));
    for (let i = 0; i < paramFloatMatches.length; i++) {
        const match = paramFloatMatches[i];
        if (match[1]) pathParams.set(match[1], { type: 'number', format: 'float' });
    }

    if (pathParams.size > 0) {
        if (!inferredSpec.parameters) inferredSpec.parameters = [];
        pathParams.forEach((schema, paramName) => {
            inferredSpec.parameters.push({
                name: paramName,
                in: 'path',
                required: true,
                schema: { type: schema.type, ...(schema.format ? { format: schema.format } : {}) }
            });
        });
    }

    // Detect Headers
    const headerMatches = Array.from(handlerSource.matchAll(REGEX_HEADER_GET));
    for (let i = 0; i < headerMatches.length; i++) {
        const match = headerMatches[i];
        if (match[1]) {
            if (!inferredSpec.parameters) inferredSpec.parameters = [];
            inferredSpec.parameters.push({
                name: match[1],
                in: 'header',
                schema: { type: 'string' }
            });
        }
    }

    // Detect response formats
    const responses: any = {};

    if (handlerSource.includes('ctx.json(')) {
        responses['200'] = {
            description: 'Successful response',
            content: { 'application/json': { schema: { type: 'object' } } }
        };
    }

    if (handlerSource.includes('ctx.html(')) {
        responses['200'] = {
            description: 'Successful response',
            content: { 'text/html': { schema: { type: 'string' } } }
        };
    }

    if (handlerSource.includes('ctx.text(')) {
        responses['200'] = {
            description: 'Successful response',
            content: { 'text/plain': { schema: { type: 'string' } } }
        };
    }

    if (handlerSource.includes('ctx.file(')) {
        responses['200'] = {
            description: 'File download',
            content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } }
        };
    }

    if (handlerSource.includes('ctx.redirect(')) {
        responses['302'] = { description: 'Redirect' };
    }

    // Fallback to JSON for plain object returns
    if (!responses['200'] && /return\s+\{/.test(handlerSource)) {
        responses['200'] = {
            description: 'Successful response',
            content: { 'application/json': { schema: { type: 'object' } } }
        };
    }

    // Detect Error Responses
    const errorStatusMatches = Array.from(handlerSource.matchAll(REGEX_ERROR_STATUS));
    for (let i = 0; i < errorStatusMatches.length; i++) {
        const match = errorStatusMatches[i];
        const statusCode = match[1];
        if (statusCode && statusCode !== '200') {
            responses[statusCode] = { description: `Error response (${statusCode})` };
        }
    }

    if (Object.keys(responses).length > 0) {
        inferredSpec.responses = responses;
    }

    return { inferredSpec };
}

/**
 * Statically generate an OpenAPI spec from a ShokupanRouter instance.
 * 
 * @param rootRouter - The root router instance to generate the spec tree from.
 * @param options - Optional OpenAPI configuration options.
 * @returns The generated OpenAPI spec.
 */
export async function generateOpenApi<T extends Record<string, any>>(rootRouter: ShokupanRouter<T>, options: OpenAPIOptions = {}): Promise<any> {
    const paths: Record<string, any> = {};
    const tagGroups = new Map<string, Set<string>>();

    const defaultTagGroup = options.defaultTagGroup || "General";
    const defaultTagName = options.defaultTag || "Application";

    // Step 4: Run AST Analysis if possible
    let astRoutes: any[] = [];
    try {
        // Dynamic import to avoid bundling issues if strictly runtime
        const { OpenAPIAnalyzer } = await import('../analysis/openapi-analyzer');
        const analyzer = new OpenAPIAnalyzer(process.cwd());
        const { applications } = await analyzer.analyze();

        // Create a map for easy lookup of apps by name/class
        const appMap = new Map<string, any>();
        applications.forEach(app => {
            appMap.set(app.name, app);
            // Also map by direct className if it's unique enough (heuristic)
            if (app.name !== app.className) {
                appMap.set(app.className, app);
            }
        });

        const getExpandedRoutes = (app: any, prefix: string = '', seen = new Set<string>()): any[] => {
            // Prevent infinite recursion in cyclic mounts
            if (seen.has(app.name)) return [];
            const newSeen = new Set(seen);
            newSeen.add(app.name);

            const expanded: any[] = [];

            // Add app's own routes with accumulated prefix
            for (let i = 0; i < app.routes.length; i++) {
                const route = app.routes[i];
                const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
                const cleanPath = route.path.startsWith('/') ? route.path : '/' + route.path;
                let joined = cleanPrefix + cleanPath;
                if (joined.length > 1 && joined.endsWith('/')) {
                    joined = joined.slice(0, -1);
                }

                expanded.push({
                    ...route,
                    path: joined || '/'
                });
            }

            // Recurse into mounted apps
            if (app.mounted) {
                for (let i = 0; i < app.mounted.length; i++) {
                    const mount = app.mounted[i];
                    const targetApp = appMap.get(mount.target);
                    if (targetApp) {
                        const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
                        const mountPrefix = mount.prefix.startsWith('/') ? mount.prefix : '/' + mount.prefix;
                        expanded.push(...getExpandedRoutes(targetApp, cleanPrefix + mountPrefix, newSeen));
                    }
                }
            }
            return expanded;
        };

        // Expand routes for all applications
        // This generates variants: e.g. UserController at '/' AND Main->UserController at '/api/user'
        applications.forEach(app => {
            astRoutes.push(...getExpandedRoutes(app));
        });

        // Deduplicate AST Routes with Scoring
        // Prioritize: 1. Has Response Schema, 2. Has Handler Source
        const dedupedRoutes = new Map<string, { route: any, score: number; }>();

        for (let i = 0; i < astRoutes.length; i++) {
            const route = astRoutes[i];
            const key = `${route.method.toUpperCase()}:${route.path}`;
            let score = 0;
            if (route.responseSchema) score += 10;
            if (route.handlerSource) score += 5;
            // Prefer longer/specific paths? No, exact path matching handles that.

            if (!dedupedRoutes.has(key) || score > dedupedRoutes.get(key)!.score) {
                dedupedRoutes.set(key, { route, score });
            }
        }

        astRoutes = Array.from(dedupedRoutes.values()).map(v => v.route);

    } catch (e) {
        console.warn("OpenAPI AST analysis failed or skipped:", e);
    }

    const collect = (router: ShokupanRouter<T>, prefix = "", currentGroup = defaultTagGroup, defaultTag = defaultTagName) => {
        let group = currentGroup;
        let tag = defaultTag;

        if (router.config?.group) group = router.config.group;
        if (router.config?.name) {
            tag = router.config.name;
        }
        else {
            const mountPath = router[$mountPath];
            if (mountPath && mountPath !== "/") {
                const segments = mountPath.split("/").filter(Boolean);
                if (segments.length > 0) {
                    const lastSegment = segments[segments.length - 1];
                    tag = lastSegment.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                }
            }
        }

        if (!tagGroups.has(group)) tagGroups.set(group, new Set());

        const routes = (router as any)[$routes] || [];
        // console.log(`[OpenAPI] Visiting router with ${routes.length} routes. Config:`, router.config, "Prefix:", prefix);
        // Debug symbols
        // console.log('[OpenAPI] Router keys:', Reflect.ownKeys(router).map(k => k.toString()));
        // console.log('[OpenAPI] Local $routes symbol:', $routes.toString());

        for (let i = 0; i < routes.length; i++) {
            const route = routes[i];
            const routeGroup = route.group || group;
            const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
            const cleanSubPath = route.path.startsWith("/") ? route.path : "/" + route.path;
            let fullPath = (cleanPrefix + cleanSubPath) || "/";
            fullPath = fullPath.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");

            // Normalize trailing slash
            if (fullPath.length > 1 && fullPath.endsWith('/')) {
                fullPath = fullPath.slice(0, -1);
            }

            if (!paths[fullPath]) paths[fullPath] = {};

            // Initialize operation structure
            const operation: any = {
                responses: { '200': { description: "Successful response" } },
                tags: [tag]
            };

            // Merge metadata from guards (if any)
            if (route.guards) {
                for (let j = 0; j < route.guards.length; j++) {
                    const guard = route.guards[j];
                    if (guard.spec) {
                        // Merge security (deduplicated)
                        if (guard.spec.security) {
                            const existing = operation.security || [];
                            for (let k = 0; k < guard.spec.security.length; k++) {
                                const req = guard.spec.security[k];
                                const reqStr = JSON.stringify(req);
                                if (!existing.some((e: any) => JSON.stringify(e) === reqStr)) {
                                    existing.push(req);
                                }
                            }
                            operation.security = existing;
                        }
                        // Merge responses
                        if (guard.spec.responses) {
                            operation.responses = { ...operation.responses, ...guard.spec.responses };
                        }
                    }
                }
            }

            // --- Step 4: Base Data from AST ---

            // 1. Exact Match (Method + Path)
            let astMatch = astRoutes.find(r =>
                r.method.toUpperCase() === route.method.toUpperCase() &&
                r.path === fullPath
            );

            // 2. Fallback: Match by Handler Source (ignores Path mismatch due to mounting prefixes)
            if (!astMatch) {
                let runtimeSource = route.handler.toString();
                if ((route.handler as any).originalHandler) {
                    runtimeSource = (route.handler as any).originalHandler.toString();
                }

                const runtimeHandlerSrc = runtimeSource.replace(/\s+/g, ' ');

                // Filter all AST routes with same method
                const sameMethodRoutes = astRoutes.filter(r => r.method.toUpperCase() === route.method.toUpperCase());

                // Find one that matches source
                astMatch = sameMethodRoutes.find(r => {
                    const astHandlerSrc = (r.handlerSource || r.handlerName || '').replace(/\s+/g, ' ');
                    if (!astHandlerSrc || astHandlerSrc.length < 20) return false;

                    const match = runtimeHandlerSrc.includes(astHandlerSrc) ||
                        astHandlerSrc.includes(runtimeHandlerSrc) ||
                        (r.handlerSource && runtimeHandlerSrc.includes(r.handlerSource.substring(0, 50)));

                    return match;
                });
            }


            // Disambiguate if multiple routes share the same path/method
            const potentialMatches = astRoutes.filter(r =>
                r.method.toUpperCase() === route.method.toUpperCase() &&
                r.path === fullPath
            );

            if (potentialMatches.length > 1) {
                const runtimeHandlerSrc = route.handler.toString().replace(/\s+/g, ' ');

                // Try to find the best match by checking if AST handler snippet is in Runtime handler source
                const preciseMatch = potentialMatches.find(r => {
                    const astHandlerSrc = (r.handlerSource || r.handlerName || '').replace(/\s+/g, ' ');

                    // Relaxed matching: check if ONE includes the other (source code containment)
                    const match = runtimeHandlerSrc.includes(astHandlerSrc) || astHandlerSrc.includes(runtimeHandlerSrc) ||
                        (r.handlerSource && runtimeHandlerSrc.includes(r.handlerSource.substring(0, 50)));

                    return match;
                });

                if (preciseMatch) {
                    astMatch = preciseMatch;
                }
            }

            if (astMatch) {
                if (astMatch.summary) operation.summary = astMatch.summary;
                if (astMatch.description) operation.description = astMatch.description;
                if (astMatch.tags) operation.tags = astMatch.tags;
                if (astMatch.operationId) operation.operationId = astMatch.operationId;

                // Merge Request Body
                if (astMatch.requestTypes?.body) {
                    operation.requestBody = {
                        content: {
                            'application/json': { schema: astMatch.requestTypes.body }
                        }
                    };
                }

                // Merge Responses
                if (astMatch.responseSchema) {
                    operation.responses['200'] = {
                        description: 'Successful response',
                        content: {
                            'application/json': { schema: astMatch.responseSchema }
                        }
                    };
                }
                else if (astMatch.responseType) {
                    const contentType = astMatch.responseType === 'string' ? 'text/plain' : 'application/json';
                    operation.responses['200'] = {
                        description: 'Successful response',
                        content: {
                            [contentType]: { schema: { type: astMatch.responseType } }
                        }
                    };
                }

                // Merge Parameters (Query, Path, Header) from AST
                const params: any[] = [];
                if (astMatch.requestTypes?.query) {
                    const queryEntries = Object.entries(astMatch.requestTypes.query);
                    for (let j = 0; j < queryEntries.length; j++) {
                        const [name, _type] = queryEntries[j];
                        params.push({ name, in: 'query', schema: { type: 'string' } });
                    }
                }

                if (params.length > 0) {
                    operation.parameters = params;
                }
            }

            // --- Step 5: Decorators / Path Patterns (Runtime) ---

            // Path Keys (e.g. /users/:id)
            if (route.keys.length > 0) {
                const pathParams = route.keys.map((key: string) => ({
                    name: key,
                    in: "path",
                    required: true,
                    schema: { type: "string" }
                }));
                // Merge into existing parameters
                const existingParams = operation.parameters || [];
                const mergedParams = [...existingParams];

                pathParams.forEach(p => {
                    const idx = mergedParams.findIndex(ep => ep.in === 'path' && ep.name === p.name);
                    if (idx >= 0) {
                        mergedParams[idx] = deepMerge(mergedParams[idx], p);
                    } else {
                        mergedParams.push(p);
                    }
                });
                operation.parameters = mergedParams;
            }

            // Runtime analysis (analyzeHandler)
            const { inferredSpec } = analyzeHandler(route.handler);
            if (inferredSpec) {
                if (inferredSpec.parameters) {
                    const existingParams = operation.parameters || [];
                    const mergedParams = [...existingParams];

                    for (let j = 0; j < inferredSpec.parameters.length; j++) {
                        const p = inferredSpec.parameters[j];
                        const idx = mergedParams.findIndex((ep: any) => ep.name === p.name && ep.in === p.in);
                        if (idx >= 0) {
                            mergedParams[idx] = deepMerge(mergedParams[idx], p);
                        } else {
                            mergedParams.push(p);
                        }
                    }
                    operation.parameters = mergedParams;
                    delete inferredSpec.parameters;
                }
                deepMerge(operation, inferredSpec);
            }

            // Merge metadata from runtime route definition (Manual override)
            if (route.handlerSpec) {
                const spec = route.handlerSpec;
                if (spec.summary) operation.summary = spec.summary;
                if (spec.description) operation.description = spec.description;
                if (spec.operationId) operation.operationId = spec.operationId;
                if (spec.tags) operation.tags = spec.tags;
                if (spec.security) operation.security = spec.security;

                // Merge responses
                if (spec.responses) {
                    operation.responses = { ...operation.responses, ...spec.responses };
                }
            }

            // Apply tags
            if (!operation.tags || operation.tags.length === 0) operation.tags = [tag];

            if (operation.tags) {
                operation.tags = Array.from(new Set(operation.tags));
                for (let j = 0; j < operation.tags.length; j++) {
                    const t = operation.tags[j];
                    if (!tagGroups.has(routeGroup)) tagGroups.set(routeGroup, new Set());
                    tagGroups.get(routeGroup)?.add(t);
                }
            }

            const methodLower = route.method.toLowerCase();
            if (methodLower === "all") {
                ["get", "post", "put", "delete", "patch"].forEach(m => {
                    if (!paths[fullPath][m]) paths[fullPath][m] = { ...operation };
                });
            }
            else {
                paths[fullPath][methodLower] = operation;
            }
        };

        const controllers = router[$childControllers];
        for (let i = 0; i < controllers.length; i++) {
            const controller = controllers[i];
            const controllerName = controller.constructor.name || "UnknownController";
            tagGroups.get(group)?.add(controllerName);
        }

        const childRouters = router[$childRouters];
        for (let i = 0; i < childRouters.length; i++) {
            const child = childRouters[i];
            const mountPath = child[$mountPath];
            const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
            const cleanMount = mountPath.startsWith("/") ? mountPath : "/" + mountPath;
            const nextPrefix = (cleanPrefix + cleanMount) || "/";
            collect(child, nextPrefix, group, tag);
        }
    };

    collect(rootRouter);

    const xTagGroups: { name: string; tags: string[]; }[] = [];
    const tagGroupEntries = Array.from(tagGroups.entries());
    for (let i = 0; i < tagGroupEntries.length; i++) {
        const [name, tags] = tagGroupEntries[i];
        xTagGroups.push({ name, tags: Array.from(tags).sort() });
    }

    return {
        openapi: "3.1.0",
        info: { title: "Shokupan API", version: "1.0.0", ...options.info },
        paths,
        components: options.components,
        servers: options.servers,
        tags: options.tags,
        externalDocs: options.externalDocs,
        "x-tagGroups": xTagGroups
    };
}
