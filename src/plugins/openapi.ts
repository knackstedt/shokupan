import type { ShokupanRouter } from '../router';
import { $childControllers, $childRouters, $mountPath, $routes } from '../symbol';
import type { OpenAPIOptions, ShokupanHandler } from '../types';
import { deepMerge } from '../util/deep-merge';

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


    // Detect query parameters with type detection
    const queryParams = new Map<string, { type: string; format?: string; }>();

    const queryIntMatch = handlerSource.match(/parseInt\(ctx\.query\.(\w+)\)/g);
    if (queryIntMatch) {
        queryIntMatch.forEach(match => {
            const paramName = match.match(/ctx\.query\.(\w+)/)?.[1];
            if (paramName) queryParams.set(paramName, { type: 'integer', format: 'int32' });
        });
    }

    const queryFloatMatch = handlerSource.match(/parseFloat\(ctx\.query\.(\w+)\)/g);
    if (queryFloatMatch) {
        queryFloatMatch.forEach(match => {
            const paramName = match.match(/ctx\.query\.(\w+)/)?.[1];
            if (paramName) queryParams.set(paramName, { type: 'number', format: 'float' });
        });
    }

    const queryNumberMatch = handlerSource.match(/Number\(ctx\.query\.(\w+)\)/g);
    if (queryNumberMatch) {
        queryNumberMatch.forEach(match => {
            const paramName = match.match(/ctx\.query\.(\w+)/)?.[1];
            if (paramName && !queryParams.has(paramName)) {
                queryParams.set(paramName, { type: 'number' });
            }
        });
    }

    const queryBoolMatch = handlerSource.match(/(?:Boolean\(ctx\.query\.(\w+)\)|!+ctx\.query\.(\w+))/g);
    if (queryBoolMatch) {
        queryBoolMatch.forEach(match => {
            const paramName = match.match(/ctx\.query\.(\w+)/)?.[1];
            if (paramName && !queryParams.has(paramName)) {
                queryParams.set(paramName, { type: 'boolean' });
            }
        });
    }

    const queryMatch = handlerSource.match(/ctx\.query\.(\w+)/g);
    if (queryMatch) {
        queryMatch.forEach(match => {
            const paramName = match.split('.')[2];
            if (paramName && !queryParams.has(paramName)) {
                queryParams.set(paramName, { type: 'string' });
            }
        });
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

    // Detect path parameters
    const pathParams = new Map<string, { type: string; format?: string; }>();

    const paramIntMatch = handlerSource.match(/parseInt\(ctx\.params\.(\w+)\)/g);
    if (paramIntMatch) {
        paramIntMatch.forEach(match => {
            const paramName = match.match(/ctx\.params\.(\w+)/)?.[1];
            if (paramName) pathParams.set(paramName, { type: 'integer', format: 'int32' });
        });
    }

    const paramFloatMatch = handlerSource.match(/parseFloat\(ctx\.params\.(\w+)\)/g);
    if (paramFloatMatch) {
        paramFloatMatch.forEach(match => {
            const paramName = match.match(/ctx\.params\.(\w+)/)?.[1];
            if (paramName) pathParams.set(paramName, { type: 'number', format: 'float' });
        });
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

    // Detect headers
    const headerMatch = handlerSource.match(/ctx\.get\(['"](\w+)['"]\)/g);
    if (headerMatch) {
        if (!inferredSpec.parameters) inferredSpec.parameters = [];
        headerMatch.forEach(match => {
            const headerName = match.match(/['"](\w+)['"]/)?.[1];
            if (headerName) {
                inferredSpec.parameters.push({
                    name: headerName,
                    in: 'header',
                    schema: { type: 'string' }
                });
            }
        });
    }

    // Detect response formats from ctx methods
    const responses: any = {};

    // Detect ctx.json() → application/json
    if (handlerSource.includes('ctx.json(')) {
        responses['200'] = {
            description: 'Successful response',
            content: {
                'application/json': { schema: { type: 'object' } }
            }
        };
    }

    // Detect ctx.html() → text/html
    if (handlerSource.includes('ctx.html(')) {
        responses['200'] = {
            description: 'Successful response',
            content: {
                'text/html': { schema: { type: 'string' } }
            }
        };
    }

    // Detect ctx.text() → text/plain
    if (handlerSource.includes('ctx.text(')) {
        responses['200'] = {
            description: 'Successful response',
            content: {
                'text/plain': { schema: { type: 'string' } }
            }
        };
    }

    // Detect ctx.file() → application/octet-stream
    if (handlerSource.includes('ctx.file(')) {
        responses['200'] = {
            description: 'File download',
            content: {
                'application/octet-stream': { schema: { type: 'string', format: 'binary' } }
            }
        };
    }

    // Detect ctx.redirect() → 3xx redirect
    if (handlerSource.includes('ctx.redirect(')) {
        responses['302'] = {
            description: 'Redirect'
        };
    }

    // Detect plain object return (fallback to JSON) - Pattern: return { ... }
    if (!responses['200'] && /return\s+\{/.test(handlerSource)) {
        responses['200'] = {
            description: 'Successful response',
            content: {
                'application/json': { schema: { type: 'object' } }
            }
        };
    }

    // Detect error responses with status codes
    // Pattern: ctx.json({...}, 400) or ctx.text('error', 500)
    const errorStatusMatch = handlerSource.match(/ctx\.(?:json|text|html)\([^)]+,\s*(\d{3,})\)/g);
    if (errorStatusMatch) {
        errorStatusMatch.forEach(match => {
            const statusCode = match.match(/,\s*(\d{3,})\)/)?.[1];
            if (statusCode && statusCode !== '200') {
                responses[statusCode] = {
                    description: `Error response (${statusCode})`
                };
            }
        });
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
            for (const route of app.routes) {
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
                for (const mount of app.mounted) {
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

        for (const route of astRoutes) {
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

        for (const route of routes) {
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
                // Iterate guards to harvest security requirements or responses
                for (const guard of route.guards) {
                    if (guard.spec) {
                        // Merge security (deduplicated)
                        if (guard.spec.security) {
                            const existing = operation.security || [];
                            for (const req of guard.spec.security) {
                                const reqStr = JSON.stringify(req);
                                if (!existing.some((e: any) => JSON.stringify(e) === reqStr)) {
                                    existing.push(req);
                                }
                            }
                            operation.security = existing;
                        }
                        // Merge responses (e.g. 401/403)
                        if (guard.spec.responses) {
                            operation.responses = { ...operation.responses, ...guard.spec.responses };
                        }
                    }
                }
            }

            // --- Step 4: Base Data from AST ---
            // Find matching AST route
            // Matching logic: Method + Path (normalized) + Handler Source Matching

            // 1. Exact Match (Method + Path)
            let astMatch = astRoutes.find(r =>
                r.method.toUpperCase() === route.method.toUpperCase() &&
                r.path === fullPath
            );

            // 2. Fallback: Match by Handler Source (ignores Path mismatch due to mounting prefixes)
            if (!astMatch) {
                // Unwrap: If handler is wrapped (e.g. Controller), check originalHandler
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
                    if (!astHandlerSrc || astHandlerSrc.length < 20) return false; // fast fail on empty/short

                    const match = runtimeHandlerSrc.includes(astHandlerSrc) ||
                        astHandlerSrc.includes(runtimeHandlerSrc) ||
                        (r.handlerSource && runtimeHandlerSrc.includes(r.handlerSource.substring(0, 50)));

                    return match;
                });

                if (astMatch) {
                    // console.log(`[OpenAPI] MATCHED via source!`);
                }
            }


            // Disambiguate if multiple routes share the same path/method (but from different apps/files)
            // AND we haven't found a source-based match yet (or we verified exact path match but need to be sure)
            // Actually, if we found a source-based match in step 2, we are good.
            // If we found an exact path match in step 1, we might still have ambiguity if multiple files define same path?
            // Existing disambiguation logic relied on exact path. Let's keep it for exact path cases.

            const potentialMatches = astRoutes.filter(r =>
                r.method.toUpperCase() === route.method.toUpperCase() &&
                r.path === fullPath
            );

            if (potentialMatches.length > 1) {
                const runtimeHandlerSrc = route.handler.toString().replace(/\s+/g, ' ');
                // console.log(`[OpenAPI] Disambiguating ${potentialMatches.length} matches for ${fullPath}...`);

                // Try to find the best match by checking if AST handler snippet is in Runtime handler source
                const preciseMatch = potentialMatches.find(r => {
                    const astHandlerSrc = (r.handlerSource || r.handlerName || '').replace(/\s+/g, ' ');

                    // Relaxed matching: check if ONE includes the other (source code containment)
                    // limit length to avoid huge string comparisons if not needed
                    const match = runtimeHandlerSrc.includes(astHandlerSrc) || astHandlerSrc.includes(runtimeHandlerSrc) ||
                        (r.handlerSource && runtimeHandlerSrc.includes(r.handlerSource.substring(0, 50))); /* Fallback to prefix match */

                    // console.log(`- comparing with AST source: "${astHandlerSrc.substring(0, 50)}..."`);
                    // console.log(`  MATCH: ${match}`);
                    return match;
                });

                if (preciseMatch) {
                    astMatch = preciseMatch;
                }
            }

            // Clean up debug logs
            // if (fullPath === "/" && route.method.toUpperCase() === "GET") { ... }

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
                    // AST gives us { param: type }, we need to convert to OpenAPI param
                    // This part of AST analyzer might need improvement to give types, currently it gives string map?
                    // Let's assume the analyzer gives us schema-like objects or we infer basic string
                    for (const [name, _type] of Object.entries(astMatch.requestTypes.query)) {
                        params.push({ name, in: 'query', schema: { type: 'string' } }); // simplifying for now
                    }
                }
                // ... similar for headers
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
                        // Overwrite or keep? Usually runtime path keys are the source of truth for existence
                        mergedParams[idx] = deepMerge(mergedParams[idx], p);
                    } else {
                        mergedParams.push(p);
                    }
                });
                operation.parameters = mergedParams;
            }

            // Runtime analysis (analyzeHandler) - this is the "detectable code usage" part from step 2/3 but done at runtime
            // The prompt says Step 2 & 3 is AST. But existing code had `analyzeHandler`.
            // Let's keep `analyzeHandler` as a fallback or supplementary to AST if AST missed it 
            // OR if the user meant Step 2/3 to BE the AST part (which is "Step 4" in my plan corresponding to user's point 4).
            // User point 5: "Decorators included in this library".

            // We have route.guards (Decorators sometimes add guards or metadata)
            // But we don't have a direct "Decorators" list on the route object itself unless we stored it.
            // `route.handlerSpec` seems to be used for manual overrides in `types.ts`?
            // Wait, existing code used `analyzeHandler`. The user said "Step 2: ... generates OpenAPI data ... input fields".
            // And "Step 4: ... AST ...".
            // Actually, point 1 says "reads the TS files". So Step 2/3 ARE AST.
            // Point 5 is "Decorators".

            // So `analyzeHandler` (regex based) is probably less reliable than AST and might be redundant if AST works.
            // But if AST fails (e.g. dynamic code), `analyzeHandler` is good.
            // Let's treat `analyzeHandler` as part of Step 5 (Runtime/Decorator logic) or just merge it in.
            const { inferredSpec } = analyzeHandler(route.handler);
            if (inferredSpec) {
                if (inferredSpec.parameters) {
                    const existingParams = operation.parameters || [];
                    const mergedParams = [...existingParams];

                    for (const p of inferredSpec.parameters) {
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
                for (const t of operation.tags) {
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

        for (const controller of router[$childControllers]) {
            const controllerName = controller.constructor.name || "UnknownController";
            tagGroups.get(group)?.add(controllerName);
        }

        for (const child of router[$childRouters]) {
            const mountPath = child[$mountPath];
            const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
            const cleanMount = mountPath.startsWith("/") ? mountPath : "/" + mountPath;
            const nextPrefix = (cleanPrefix + cleanMount) || "/";
            collect(child, nextPrefix, group, tag);
        }
    };

    collect(rootRouter);

    const xTagGroups: { name: string; tags: string[]; }[] = [];
    for (const [name, tags] of tagGroups) {
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
