import type { OpenAPI } from '@scalar/openapi-types';
import type { ShokupanRouter } from '../router';
import { $childControllers, $childRouters, $mountPath, $routes } from '../symbol';
import type { OpenAPIOptions } from '../types';
import { deepMerge } from '../util/deep-merge';

export function generateOpenApi<T extends Record<string, any>>(rootRouter: ShokupanRouter<T>, options: OpenAPIOptions = {}): OpenAPI.Document {
    const paths: OpenAPI.Document['paths'] = {};
    const tagGroups = new Map<string, Set<string>>();

    const defaultTagGroup = options.defaultTagGroup || "General";
    const defaultTagName = options.defaultTag || "Application";

    // Helper to collect routes
    const collect = (router: ShokupanRouter<T>, prefix = "", currentGroup = defaultTagGroup, defaultTag = defaultTagName) => {
        // Determine effective group and tag for this router
        let group = currentGroup;
        let tag = defaultTag;

        // If explicit group name is provided, switch to that group
        if (router.config?.group) {
            group = router.config.group;
        }

        // If explicit name is provided, switch to that tag
        // If name is present, it updates the Tag.
        if (router.config?.name) {
            tag = router.config.name;
        } else {
            // Infer from mountPath if name is missing
            const mountPath = router[$mountPath];
            if (mountPath && mountPath !== "/") {
                // Convert /path/to/something -> Something? Or PathToSomething?
                // Strategy: Take the last segment
                const segments = mountPath.split("/").filter(Boolean);
                if (segments.length > 0) {
                    const lastSegment = segments[segments.length - 1];
                    // Capitalize logic
                    const humanized = lastSegment
                        .replace(/[-_]/g, ' ')
                        .replace(/\b\w/g, c => c.toUpperCase());

                    tag = humanized;
                }
            }
        }

        // Ensure group exists
        if (!tagGroups.has(group)) {
            tagGroups.set(group, new Set());
        }

        // 1. Local Routes
        // Accessing routes via Symbol as per refactor plan
        const routes = (router as any)[$routes] || [];

        for (const route of routes) {
            // Determine effective group for this route
            const routeGroup = route.group || group;

            // Determine full path
            const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
            const cleanSubPath = route.path.startsWith("/") ? route.path : "/" + route.path;
            let fullPath = (cleanPrefix + cleanSubPath) || "/";

            // Convert path parameters from :param to {param} for OpenAPI
            fullPath = fullPath.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");

            // Initialize path item if missing
            if (!paths[fullPath]) {
                paths[fullPath] = {};
            }

            // Generate Operation Spec
            const operation: OpenAPI.Operation = {
                responses: {
                    200: { description: "OK" }
                }
            };

            // Add Path Parameters from route keys
            if (route.keys.length > 0) {
                operation.parameters = route.keys.map((key: string) => ({
                    name: key,
                    in: "path",
                    required: true,
                    schema: { type: "string" }
                }));
            }

            // Merge Guard Specs
            if (route.guards) {
                for (const guard of route.guards) {
                    if (guard.spec) {
                        deepMerge(operation, guard.spec);
                    }
                }
            }

            // Merge Handler Spec
            if (route.handlerSpec) {
                deepMerge(operation, route.handlerSpec);
            }

            // Apply Default Tag if none exist
            if (!operation.tags || operation.tags.length === 0) {
                operation.tags = [tag];
            }

            // Deduplicate Tags
            if (operation.tags) {
                operation.tags = Array.from(new Set(operation.tags));
                // Register tags to group
                for (const t of operation.tags) {
                    // Ensure group exists if it was switched
                    if (!tagGroups.has(routeGroup)) {
                        tagGroups.set(routeGroup, new Set());
                    }
                    tagGroups.get(routeGroup)?.add(t);
                }
            }

            // Assign to path item
            const methodLower = route.method.toLowerCase();
            if (methodLower === "all") {
                ["get", "post", "put", "delete", "patch"].forEach(m => {
                    if (!(paths as any)[fullPath][m]) {
                        (paths as any)[fullPath][m] = { ...operation };
                    }
                });
            } else {
                (paths as any)[fullPath][methodLower] = operation;
            }
        }

        // 2. Child Controllers
        for (const controller of router[$childControllers]) {
            const mountPath = (controller as any)[$mountPath] || ""; // Should differ based on controller logic
            // Re-calculate prefix for controller
            const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
            const cleanMount = mountPath.startsWith("/") ? mountPath : "/" + mountPath;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const nextPrefix = (cleanPrefix + cleanMount) || "/";

            // Controller Name as Tag
            const controllerName = controller.constructor.name || "UnknownController";
            tagGroups.get(group)?.add(controllerName);

            // Note: Controller routes are also added to `routes` via `mount()`, so they are processed in loop #1.
            // Tagging logic for controller-based routes should ideally be handled within the route metadata itself.
        }

        // 3. Child Routers
        for (const child of router[$childRouters]) {
            const mountPath = child[$mountPath];
            const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
            const cleanMount = mountPath.startsWith("/") ? mountPath : "/" + mountPath;
            const nextPrefix = (cleanPrefix + cleanMount) || "/";

            collect(child, nextPrefix, group, tag);
        }
    };

    collect(rootRouter);

    // Build x-tagGroups
    const xTagGroups: { name: string; tags: string[]; }[] = [];
    for (const [name, tags] of tagGroups) {
        xTagGroups.push({
            name,
            tags: Array.from(tags).sort()
        });
    }

    return {
        openapi: "3.1.0",
        info: {
            title: "Shokupan API",
            version: "1.0.0",
            ...options.info
        },
        paths,
        components: options.components,
        servers: options.servers,
        tags: options.tags,
        externalDocs: options.externalDocs,
        "x-tagGroups": xTagGroups
    } as OpenAPI.Document;
}
