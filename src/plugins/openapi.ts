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

    // Detect response
    if (handlerSource.includes('ctx.json(')) {
        inferredSpec.responses = {
            '200': {
                description: 'Successful response',
                content: { 'application/json': { schema: { type: 'object' } } }
            }
        };
    }

    return { inferredSpec };
}

export function generateOpenApi<T extends Record<string, any>>(rootRouter: ShokupanRouter<T>, options: OpenAPIOptions = {}): any {
    const paths: Record<string, any> = {};
    const tagGroups = new Map<string, Set<string>>();

    const defaultTagGroup = options.defaultTagGroup || "General";
    const defaultTagName = options.defaultTag || "Application";

    const collect = (router: ShokupanRouter<T>, prefix = "", currentGroup = defaultTagGroup, defaultTag = defaultTagName) => {
        let group = currentGroup;
        let tag = defaultTag;

        if (router.config?.group) group = router.config.group;
        if (router.config?.name) {
            tag = router.config.name;
        } else {
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

        for (const route of routes) {
            const routeGroup = route.group || group;
            const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
            const cleanSubPath = route.path.startsWith("/") ? route.path : "/" + route.path;
            let fullPath = (cleanPrefix + cleanSubPath) || "/";
            fullPath = fullPath.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");

            if (!paths[fullPath]) paths[fullPath] = {};

            const operation: any = { responses: { '200': { description: "OK" } } };

            if (route.keys.length > 0) {
                operation.parameters = route.keys.map((key: string) => ({
                    name: key,
                    in: "path",
                    required: true,
                    schema: { type: "string" }
                }));
            }

            // Runtime analysis
            const { inferredSpec } = analyzeHandler(route.handler);
            if (inferredSpec) {
                if (inferredSpec.parameters && operation.parameters) {
                    const paramMap = new Map<string, any>();
                    operation.parameters.forEach((p: any) => paramMap.set(`${p.in}:${p.name}`, p));
                    inferredSpec.parameters.forEach((p: any) => paramMap.set(`${p.in}:${p.name}`, p));
                    operation.parameters = Array.from(paramMap.values());
                    const { parameters, ...restInferred } = inferredSpec;
                    deepMerge(operation, restInferred);
                } else {
                    deepMerge(operation, inferredSpec);
                }
            }

            if (route.guards) {
                for (const guard of route.guards) {
                    if (guard.spec) deepMerge(operation, guard.spec);
                }
            }

            if (route.handlerSpec) deepMerge(operation, route.handlerSpec);

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

        for (const controller of router[$childControllers]) {
            const mountPath = (controller as any)[$mountPath] || "";
            const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
            const cleanMount = mountPath.startsWith("/") ? mountPath : "/" + mountPath;
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
