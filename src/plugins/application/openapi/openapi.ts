import type { ShokupanRouter } from '../../../router';
import { deepMerge } from '../../../util/deep-merge';
import { $childControllers, $childRouters, $mountPath, $routes } from '../../../util/symbol';
import type { OpenAPIOptions, ShokupanHandler } from '../../../util/types';

/**
 * Regex patterns for analyzing handler source code to infer types.
 */
const REGEX_PATTERNS = {
    QUERY_INT: /parseInt\(ctx\.query\.(\w+)\)/g,
    QUERY_FLOAT: /parseFloat\(ctx\.query\.(\w+)\)/g,
    QUERY_NUMBER: /Number\(ctx\.query\.(\w+)\)/g,
    QUERY_BOOL: /(?:Boolean\(ctx\.query\.(\w+)\)|!+ctx\.query\.(\w+))/g,
    QUERY_GENERIC: /ctx\.query\.(\w+)/g,
    PARAM_INT: /parseInt\(ctx\.params\.(\w+)\)/g,
    PARAM_FLOAT: /parseFloat\(ctx\.params\.(\w+)\)/g,
    PARAM_GENERIC: /ctx\.params\.(\w+)/,
    HEADER_GET: /ctx\.get\(['"](\w+)['"]\)/g,
    ERROR_STATUS: /ctx\.(?:json|text|html)\([^)]+,\s*(\d{3,})\)/g
};

/**
 * Analyze a handler function to infer request/response types based on source code usage.
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

    // Helper to process regex matches
    const processMatches = (regex: RegExp, type: string, format?: string) => {
        const matches = Array.from(handlerSource.matchAll(regex));
        for (const match of matches) {
            const name = match[1] || match[2];
            if (name && !queryParams.has(name)) {
                queryParams.set(name, { type, format });
            }
        }
    };

    processMatches(REGEX_PATTERNS.QUERY_INT, 'integer', 'int32');
    processMatches(REGEX_PATTERNS.QUERY_FLOAT, 'number', 'float');
    processMatches(REGEX_PATTERNS.QUERY_NUMBER, 'number');
    processMatches(REGEX_PATTERNS.QUERY_BOOL, 'boolean');
    processMatches(REGEX_PATTERNS.QUERY_GENERIC, 'string');

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
    const processPathMatches = (regex: RegExp, type: string, format?: string) => {
        const matches = Array.from(handlerSource.matchAll(regex));
        for (const match of matches) {
            const name = match[1];
            if (name) pathParams.set(name, { type, format });
        }
    };

    processPathMatches(REGEX_PATTERNS.PARAM_INT, 'integer', 'int32');
    processPathMatches(REGEX_PATTERNS.PARAM_FLOAT, 'number', 'float');

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
    const headerMatches = Array.from(handlerSource.matchAll(REGEX_PATTERNS.HEADER_GET));
    for (const match of headerMatches) {
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
            description: 'Successful HTML response',
            content: { 'text/html': { schema: { type: 'string' } } }
        };
    }

    if (handlerSource.includes('ctx.jsx(')) {
        responses['200'] = {
            description: 'Successful HTML response (Rendered JSX)',
            content: { 'text/html': { schema: { type: 'string' } } }
        };
    }

    if (handlerSource.includes('ctx.text(')) {
        responses['200'] = {
            description: 'Successful text response',
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
        let hasSpecificRedirect = false;
        const redirectMatches = Array.from(handlerSource.matchAll(/ctx\.redirect\([^,]+,\s*(\d{3})\)/g));
        for (const match of redirectMatches) {
            const status = match[1];
            // Ensure the status is a valid redirect code
            if (/^30[12378]$/.test(status)) {
                responses[status] = { description: `Redirect (${status})` };
                hasSpecificRedirect = true;
            }
        }

        if (!hasSpecificRedirect) {
            responses['302'] = { description: 'Redirect' };
        }
    }

    // Fallback to JSON for plain object returns
    if (!responses['200'] && /return\s+\{/.test(handlerSource)) {
        responses['200'] = {
            description: 'Successful response',
            content: { 'application/json': { schema: { type: 'object' } } }
        };
    }

    // Detect Error Responses
    const errorStatusMatches = Array.from(handlerSource.matchAll(REGEX_PATTERNS.ERROR_STATUS));
    for (const match of errorStatusMatches) {
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
 * Gets deduped AST routes if available.
 */
async function getAstRoutes(applications: any[]) {
    const astRoutes: any[] = [];
    const expandedApps = new Map<string, any[]>();

    const getExpandedRoutes = (app: any, prefix: string = '', seen = new Set<string>(), sourceOverride?: any): any[] => {
        if (seen.has(app.name)) return [];
        const newSeen = new Set(seen);
        newSeen.add(app.name);

        const expanded: any[] = [];

        let currentPrefix = prefix;
        if (app.controllerPrefix) {
            const cleanPrefix = currentPrefix.endsWith('/') ? currentPrefix.slice(0, -1) : currentPrefix;
            const cleanCont = app.controllerPrefix.startsWith('/') ? app.controllerPrefix : '/' + app.controllerPrefix;
            currentPrefix = cleanPrefix + cleanCont;
        }

        for (const route of app.routes) {
            const cleanPrefix = currentPrefix.endsWith('/') ? currentPrefix.slice(0, -1) : currentPrefix;
            const cleanPath = route.path.startsWith('/') ? route.path : '/' + route.path;
            let joined = cleanPrefix + cleanPath;
            if (joined.length > 1 && joined.endsWith('/')) {
                joined = joined.slice(0, -1);
            }

            const expandedRoute = {
                ...route,
                path: joined || '/'
            };

            if (sourceOverride) {
                expandedRoute.sourceContext = sourceOverride;
            }

            expanded.push(expandedRoute);
        }

        if (app.mounted) {
            for (const mount of app.mounted) {
                const targetApp = applications.find(a => a.name === mount.target || a.className === mount.target);
                if (targetApp) {
                    const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
                    const mountPrefix = mount.prefix.startsWith('/') ? mount.prefix : '/' + mount.prefix;

                    // Check for builtin/external dependency to override source
                    let nextSourceOverride = sourceOverride;
                    if (mount.dependency || (mount.targetFilePath && mount.targetFilePath.includes('node_modules'))) {
                        if (mount.sourceContext) {
                            nextSourceOverride = {
                                ...mount.sourceContext,
                                // Add highlight for the mount line to make it clear
                                highlightLines: [mount.sourceContext.startLine, mount.sourceContext.endLine],
                                highlights: [{
                                    startLine: mount.sourceContext.startLine,
                                    endLine: mount.sourceContext.endLine,
                                    type: 'return-success' // Use the success color (cyan) for the mount point
                                }]
                            };
                        }
                    }

                    expanded.push(...getExpandedRoutes(targetApp, cleanPrefix + mountPrefix, newSeen, nextSourceOverride));
                }
            }
        }
        return expanded;
    };

    applications.forEach(app => {
        astRoutes.push(...getExpandedRoutes(app));
    });

    const dedupedRoutes = new Map<string, { route: any, score: number; }>();

    for (const route of astRoutes) {
        const key = `${route.method.toUpperCase()}:${route.path}`;
        let score = 0;
        if (route.responseSchema) score += 10;
        if (route.handlerSource) score += 5;

        if (!dedupedRoutes.has(key) || score > dedupedRoutes.get(key)!.score) {
            dedupedRoutes.set(key, { route, score });
        }
    }

    return Array.from(dedupedRoutes.values()).map(v => v.route);
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

    // Attempt to run AST Analysis
    let astRoutes: any[] = [];
    try {
        const { OpenAPIAnalyzer } = await import('./analyzer');
        const analyzer = new OpenAPIAnalyzer(process.cwd());
        const { applications } = await analyzer.analyze();
        astRoutes = await getAstRoutes(applications);
    } catch (e) {
        // Silently fail if analysis cannot run (e.g. runtime environment issues)
        // console.warn("OpenAPI AST analysis skipped:", e);
    }

    const collect = (router: ShokupanRouter<T>, prefix = "", currentGroup = defaultTagGroup, defaultTag = defaultTagName, inheritedMiddleware: any[] = []) => {
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

        const routerMiddleware = router.middleware || [];

        const routes = (router as any)[$routes] || [];

        for (const route of routes) {
            // Filter out non-HTTP methods (e.g. AsyncAPI PUB/SUB events)
            if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(route.method.toUpperCase())) {
                continue;
            }

            const routeGroup = route.group || group;
            const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
            const cleanSubPath = route.path.startsWith("/") ? route.path : "/" + route.path;
            let fullPath = (cleanPrefix + cleanSubPath) || "/";

            if (fullPath.length > 1 && fullPath.endsWith('/')) {
                fullPath = fullPath.slice(0, -1);
            }

            // Convert Express-style :param to OpenAPI-style {param}
            fullPath = fullPath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');

            if (!paths[fullPath]) paths[fullPath] = {};

            const operation: any = {
                responses: { '200': { description: "Successful response" } },
                tags: [tag]
            };

            // Collect Middleware
            const routeMiddleware = route.middleware || [];
            const allMiddleware = [...inheritedMiddleware, ...routerMiddleware, ...routeMiddleware];

            if (allMiddleware.length > 0) {
                operation['x-shokupan-middleware'] = allMiddleware.map(mw => ({
                    name: mw.name || 'middleware',
                    metadata: mw.metadata
                }));
            }

            if (route.guards) {
                for (const guard of route.guards) {
                    if (guard.spec) {
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
                        if (guard.spec.responses) {
                            operation.responses = { ...operation.responses, ...guard.spec.responses };
                        }
                    }
                }
            }

            // Match with AST routes
            let astMatch = astRoutes.find(r =>
                r.method.toUpperCase() === route.method.toUpperCase() &&
                r.path === fullPath
            );

            if (!astMatch) {
                // Heuristic matching based on source code similarity
                const runtimeSource = ((route.handler as any).originalHandler || route.handler).toString();
                const runtimeHandlerSrc = runtimeSource.replace(/\s+/g, ' ');

                const sameMethodRoutes = astRoutes.filter(r => r.method.toUpperCase() === route.method.toUpperCase());

                astMatch = sameMethodRoutes.find(r => {
                    const astHandlerSrc = (r.handlerSource || r.handlerName || '').replace(/\s+/g, ' ');
                    if (!astHandlerSrc || astHandlerSrc.length < 20) return false;
                    return runtimeHandlerSrc.includes(astHandlerSrc) ||
                        astHandlerSrc.includes(runtimeHandlerSrc) ||
                        (r.handlerSource && runtimeHandlerSrc.includes(r.handlerSource.substring(0, 50)));
                });
            }

            if (astMatch) {
                if (astMatch.summary) operation.summary = astMatch.summary;
                if (astMatch.description) operation.description = astMatch.description;
                if (astMatch.tags) operation.tags = astMatch.tags;
                if (astMatch.operationId) operation.operationId = astMatch.operationId;

                // Add source info
                if (astMatch.sourceContext) {
                    const sc = astMatch.sourceContext;
                    operation["x-source-info"] = {
                        file: sc.file,
                        line: sc.startLine,
                        snippet: sc.snippet || astMatch.handlerSource, // Fallback
                        offset: sc.snippetStartLine || sc.startLine,
                        highlightLines: [sc.startLine, sc.endLine],
                        highlights: sc.highlights
                    };

                    // Add x-shokupan-source for standard frontend handling
                    operation["x-shokupan-source"] = {
                        file: sc.file,
                        line: sc.startLine,
                        code: sc.snippet || astMatch.handlerSource || ''
                    };

                    // Removed markdown source block per request
                }

                if (astMatch.requestTypes?.body) {
                    operation.requestBody = {
                        content: { 'application/json': { schema: astMatch.requestTypes.body } }
                    };
                }

                if (astMatch.responseSchema) {
                    operation.responses['200'] = {
                        description: 'Successful response',
                        content: { 'application/json': { schema: astMatch.responseSchema } }
                    };
                } else if (astMatch.responseType) {
                    let contentType = 'application/json';
                    if (astMatch.responseType === 'string') contentType = 'text/plain';
                    else if (astMatch.responseType === 'html') contentType = 'text/html';

                    operation.responses['200'] = {
                        description: 'Successful response',
                        content: { [contentType]: { schema: { type: 'string' } } }
                    };
                }

                const params: any[] = [];
                if (astMatch.requestTypes?.query) {
                    for (const [name, _type] of Object.entries(astMatch.requestTypes.query)) {
                        params.push({ name, in: 'query', schema: { type: 'string' } });
                    }
                }
                if (params.length > 0) {
                    operation.parameters = params;
                }
            } else {
                // No static analysis match - Add Warning and Runtime Source
                const runtimeSource = ((route.handler as any).originalHandler || route.handler).toString();
                // Removed markdown source block and warning per request (or simplified)
                // Minimal warning
                // operation.description = (operation.description || '') + "\n\n> [!WARNING]\n> **Static Analysis Failed**";

                // Extract file/line from Error stack if available
                let file: string | undefined;
                let line: number | undefined;

                // Try to get source info from route metadata if present
                if (route.metadata?.file) {
                    file = route.metadata.file;
                    line = route.metadata.line || 1;
                }

                // Provide x-source-info with available metadata
                operation["x-source-info"] = {
                    snippet: runtimeSource,
                    isRuntime: true,
                    ...(file ? { file, line: line || 1 } : {})
                };

                // If we have file info, add it to x-shokupan-source for the API Explorer
                if (file) {
                    operation["x-shokupan-source"] = {
                        file,
                        line: line || 1,
                        code: runtimeSource
                    };
                }
            }

            // Path pattern params
            if (route.keys.length > 0) {
                const pathParams = route.keys.map((key: string) => ({
                    name: key,
                    in: "path",
                    required: true,
                    schema: { type: "string" }
                }));
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

            // Runtime analysis
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

            if (route.handlerSpec) {
                deepMerge(operation, route.handlerSpec);
            }

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
            } else {
                paths[fullPath][methodLower] = operation;
            }
        }

        const controllers = router[$childControllers];
        for (const controller of controllers) {
            const controllerName = controller.constructor.name || "UnknownController";
            tagGroups.get(group)?.add(controllerName);
        }

        const childRouters = router[$childRouters];
        for (const child of childRouters) {
            const mountPath = child[$mountPath];
            const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
            const cleanMount = mountPath.startsWith("/") ? mountPath : "/" + mountPath;
            const nextPrefix = (cleanPrefix + cleanMount) || "/";
            collect(child, nextPrefix, group, tag, [...inheritedMiddleware, ...routerMiddleware]);
        }
    };

    collect(rootRouter);

    const xTagGroups: { name: string; tags: string[]; }[] = [];
    for (const [name, tags] of tagGroups.entries()) {
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

