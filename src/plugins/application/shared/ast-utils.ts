
/**
 * Gets deduped AST routes if available.
 */
export async function getAstRoutes(applications: any[], options: { includePrefix?: boolean, pathTransform?: (p: string) => string; } = {}) {
    const { includePrefix = true, pathTransform } = options;

    const astRoutes: any[] = [];

    const getExpandedRoutes = (app: any, prefix: string = '', seen = new Set<string>(), sourceOverride?: any): any[] => {
        if (seen.has(app.name)) return [];
        const newSeen = new Set(seen);
        newSeen.add(app.name);

        const expanded: any[] = [];

        let currentPrefix = prefix;
        // Only consider controller prefix if includePrefix is true
        if (includePrefix && app.controllerPrefix) {
            const cleanPrefix = currentPrefix.endsWith('/') ? currentPrefix.slice(0, -1) : currentPrefix;
            const cleanCont = app.controllerPrefix.startsWith('/') ? app.controllerPrefix : '/' + app.controllerPrefix;
            currentPrefix = cleanPrefix + cleanCont;
        }

        for (const route of app.routes) {
            let path = route.path;

            if (includePrefix) {
                const cleanPrefix = currentPrefix.endsWith('/') ? currentPrefix.slice(0, -1) : currentPrefix;
                const cleanPath = path.startsWith('/') ? path : '/' + path;
                path = cleanPrefix + cleanPath;
                if (path.length > 1 && path.endsWith('/')) {
                    path = path.slice(0, -1);
                }
            }

            // Apply path transformation if provided (e.g. removing leading slash for events)
            if (pathTransform) {
                path = pathTransform(path);
            }
            // For OpenAPI default (if includePrefix true and no transform), ensure leading slash
            else if (includePrefix && !path.startsWith('/')) {
                path = '/' + path;
            }

            const expandedRoute = {
                ...route,
                path: path || '/'
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
                    let nextPrefix = '';

                    if (includePrefix) {
                        const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
                        const mountPrefix = mount.prefix.startsWith('/') ? mount.prefix : '/' + mount.prefix;
                        nextPrefix = cleanPrefix + mountPrefix;
                    }

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

                    expanded.push(...getExpandedRoutes(targetApp, nextPrefix, newSeen, nextSourceOverride));
                }
            }
        }
        return expanded;
    };

    applications.forEach(app => {
        astRoutes.push(...getExpandedRoutes(app));
    });

    // Deduplicate routes based on score (only relevant for OpenAPI usually, but safe for all)
    const dedupedRoutes = new Map<string, { route: any, score: number; }>();

    for (const route of astRoutes) {
        // Key includes method and path
        const key = `${route.method.toUpperCase()}:${route.path}`;
        let score = 0;
        if (route.responseSchema) score += 10;
        if (route.handlerSource) score += 5;

        // If duplicate found, keep the one with higher score (better inference)
        if (!dedupedRoutes.has(key) || score > dedupedRoutes.get(key)!.score) {
            dedupedRoutes.set(key, { route, score });
        }
    }

    return Array.from(dedupedRoutes.values()).map(v => v.route);
}
