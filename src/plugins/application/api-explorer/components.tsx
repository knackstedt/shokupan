/** @jsx h */

// Type definitions for better clarity
interface Route {
    method: string;
    path: string;
    op: any;
}

interface GroupNode {
    name: string;
    type: 'group' | 'subgroup' | 'route';
    routes?: Route[];
    children?: GroupNode[];
    path?: string;
    isBuiltin?: boolean;
}

export function ApiExplorerApp({ spec, asyncSpec, config }: any) {
    // Build hierarchy: router -> controller -> routes
    const hierarchy = new Map<string, Route[]>();

    // Helper to add route to hierarchy
    const addRoute = (groupKey: string, route: Route) => {
        if (!hierarchy.has(groupKey)) {
            hierarchy.set(groupKey, []);
        }
        hierarchy.get(groupKey)!.push(route);
    };

    // Helper to determine group key (controller/router)
    const getGroupKey = (op: any, source: any): string => {
        // 1. Prefer explicit tags if they look like "titles" (not paths)
        if (op.tags && op.tags.length > 0) {
            const tag = typeof op.tags[0] === 'string' ? op.tags[0] : op.tags[0].name;
            if (!tag.startsWith('/')) return tag;
        }

        // 2. Class Name (Controller)
        if (source?.className) return source.className;

        // 3. File Name (Router - Pretty)
        if (source?.file) {
            const parts = source.file.split('/');
            const filename = parts[parts.length - 1].replace(/\.(ts|js)$/, '');
            // Convert snake_case or kebab-case to Title Case
            return filename.split(/[-_]/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }

        // 4. Fallback to path tag if we ignored it in step 1
        if (op.tags && op.tags.length > 0) {
            const tag = typeof op.tags[0] === 'string' ? op.tags[0] : op.tags[0].name;
            return tag;
        }

        return 'Ungrouped';
    };

    // Helper to find the longest common prefix of all paths in a group
    const findCommonPrefix = (routes: Route[]): string[] => {
        if (routes.length === 0) return [];

        const allSegments = routes.map(r => {
            const cleaned = r.path.replace(/^\/|\/$/g, '');
            return cleaned.split('/');
        });

        // Find the shortest path length
        const minLength = Math.min(...allSegments.map(s => s.length));

        const commonPrefix: string[] = [];
        for (let i = 0; i < minLength; i++) {
            const segment = allSegments[0][i];
            if (allSegments.every(segments => segments[i] === segment)) {
                commonPrefix.push(segment);
            } else {
                break;
            }
        }

        return commonPrefix;
    };

    // Recursive function to create subgroups based on path prefixes
    // Only creates subgroups when 3+ routes share a common prefix AND have diverging subpaths
    const createSubgroups = (routes: Route[], depth: number = 0, commonPrefixLength: number = 0): GroupNode[] => {
        if (routes.length < 3 || depth > 5) {
            // Don't create subgroups if less than 3 routes or too deep
            return routes.map(route => ({
                name: route.path,
                type: 'route' as const,
                path: route.path,
                routes: [route]
            }));
        }

        // Analyze path structure to find common prefixes
        const pathSegments = routes.map(r => {
            // Remove leading/trailing slashes and split
            const cleaned = r.path.replace(/^\/|\/$/g, '');
            const segments = cleaned.split('/');
            // Strip the common prefix for this group
            return segments.slice(commonPrefixLength);
        });

        // Find common prefix groups
        const prefixGroups = new Map<string, Route[]>();
        const ungrouped: Route[] = [];

        routes.forEach((route, idx) => {
            const segments = pathSegments[idx];
            if (segments.length <= depth) {
                ungrouped.push(route);
                return;
            }

            // Use the segment at current depth as prefix
            const prefix = segments.slice(0, depth + 1).join('/');
            if (!prefixGroups.has(prefix)) {
                prefixGroups.set(prefix, []);
            }
            prefixGroups.get(prefix)!.push(route);
        });

        // Create subgroups for prefixes with 3+ routes that actually diverge
        const result: GroupNode[] = [];

        prefixGroups.forEach((groupRoutes, prefix) => {
            if (groupRoutes.length >= 3) {
                // Check if routes diverge after this prefix
                // If all routes in this group have the same next segment, don't create a subgroup yet
                const nextSegments = new Set<string>();
                groupRoutes.forEach((route, idx) => {
                    const routeIdx = routes.indexOf(route);
                    const segments = pathSegments[routeIdx];
                    if (segments.length > depth + 1) {
                        nextSegments.add(segments[depth + 1]);
                    }
                });

                // Only create a subgroup if there are diverging paths (2+ different next segments)
                // OR if we're at terminal paths (no more segments)
                const hasDivergingPaths = nextSegments.size >= 2;
                const allTerminal = groupRoutes.every((route, idx) => {
                    const routeIdx = routes.indexOf(route);
                    return pathSegments[routeIdx].length === depth + 1;
                });

                if (hasDivergingPaths || allTerminal) {
                    // Create a subgroup and recurse
                    const prefixName = prefix.split('/').pop() || prefix;
                    result.push({
                        name: prefixName,
                        type: 'subgroup' as const,
                        path: '/' + prefix,
                        children: createSubgroups(groupRoutes, depth + 1, commonPrefixLength)
                    });
                } else {
                    // Don't create a subgroup, just recurse with increased depth
                    // This flattens the common mount path
                    result.push(...createSubgroups(groupRoutes, depth + 1, commonPrefixLength));
                }
            } else {
                // Add to ungrouped
                ungrouped.push(...groupRoutes);
            }
        });

        // Add ungrouped routes as individual items
        ungrouped.forEach(route => {
            result.push({
                name: route.path,
                type: 'route' as const,
                path: route.path,
                routes: [route]
            });
        });

        // Sort: subgroups first, then routes
        result.sort((a, b) => {
            if (a.type === 'subgroup' && b.type !== 'subgroup') return -1;
            if (a.type !== 'subgroup' && b.type === 'subgroup') return 1;
            return a.name.localeCompare(b.name);
        });

        return result;
    };

    // Process OpenAPI paths
    Object.entries(spec.paths || {}).forEach(([path, methods]: [string, any]) => {
        Object.entries(methods).forEach(([method, op]: [string, any]) => {
            if (!op.operationId) {
                op.operationId = `${method}-${path.replace(/\//g, '-').replace(/[{}:]/g, '')}`;
            }

            const route: Route = { method, path, op };
            const source = (op as any)['x-shokupan-source'];
            const groupKey = getGroupKey(op, source);

            addRoute(groupKey, route);
        });
    });

    // Skip AsyncAPI channels - they should only appear in the AsyncAPI plugin
    // Object.entries(asyncSpec?.channels || {}).forEach(([name, ch]: [string, any]) => {
    //     const operations = [];
    //     if (ch.publish) operations.push({ method: 'recv', op: ch.publish });
    //     if (ch.subscribe) operations.push({ method: 'send', op: ch.subscribe });

    //     operations.forEach(({ method, op }) => {
    //         if (!op.operationId) op.operationId = `${method}-${name.replace(/[^a-zA-Z0-9]/g, '-')}`;

    //         const route: Route = { method, path: name, op };
    //         const source = (op as any)['x-shokupan-source'] || (op as any)['x-source-info'];
    //         const groupKey = getGroupKey(op, source);

    //         addRoute(groupKey, route);
    //     });
    // });

    // Build hierarchical groups with subgroups
    const hierarchicalGroups = Array.from(hierarchy.entries())
        .map(([name, routes]) => {
            // Sort routes by path
            routes.sort((a, b) => a.path.localeCompare(b.path));

            // Find the common prefix for all routes in this group
            const commonPrefix = findCommonPrefix(routes);
            const commonPrefixPath = '/' + commonPrefix.join('/');

            // Create subgroups recursively, stripping the common prefix
            const children = createSubgroups(routes, 0, commonPrefix.length);

            // Find middleware for this group by matching router/controller names
            const groupMiddleware: any[] = [];
            if (spec['x-middleware-registry']) {
                Object.entries(spec['x-middleware-registry']).forEach(([id, mw]: [string, any]) => {
                    // Match middleware to this group based on file path
                    const firstRoute = routes[0];
                    const routeSource = firstRoute?.op?.['x-shokupan-source'];

                    const mwFile = mw.file?.split('/').pop();
                    const routeFile = routeSource?.file?.split('/').pop();

                    // Include middleware if it comes from the same file as the routes in this group
                    if (mwFile && routeFile && mwFile === routeFile && mw.scope !== 'global') {
                        groupMiddleware.push({ ...mw, id, type: 'middleware' });
                    }
                });
            }

            const isBuiltin = routes.some(r => r.op['x-shokupan-builtin'] === true);

            return {
                name,
                type: 'group' as const,
                children,
                middleware: groupMiddleware,
                commonPrefixPath, // Store for display stripping
                isBuiltin
            };
        });

    // Add Global Middleware group
    if (spec['x-middleware-registry']) {
        const allGroupMiddleware = hierarchicalGroups.flatMap((g: any) => g.middleware || []).map((m: any) => m.id);
        const globalMiddleware = Object.entries(spec['x-middleware-registry'])
            .filter(([id]) => !allGroupMiddleware.includes(id))
            .map(([id, mw]: [string, any]) => ({ ...mw, id, type: 'middleware' }));

        if (globalMiddleware.length > 0) {
            hierarchicalGroups.push({
                name: 'Global Middleware',
                type: 'group' as const,
                children: [],
                middleware: globalMiddleware,
                commonPrefixPath: '',
                isBuiltin: false
            });
        }
    }

    // Sort groups
    hierarchicalGroups.sort((a, b) => {
        if (a.name === 'Ungrouped') return 1;
        if (b.name === 'Ungrouped') return -1;
        if (a.name === 'Global Middleware') return 1;
        if (b.name === 'Global Middleware') return -1;
        return a.name.localeCompare(b.name);
    });

    // Flatten for client-side data (keep all routes in flat structure for main content)
    const allRoutes = Array.from(hierarchy.values()).flat();

    return (
        <html lang="en">
            <head>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>{spec.info?.title || 'API Explorer'}</title>
                <link rel="stylesheet" href="style.css" />
                <link rel="stylesheet" href="theme.css" />
                <script src="https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js"></script>
                <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
                <script dangerouslySetInnerHTML={{
                    __html: `
                    (function() {
                        if (!window.location.pathname.endsWith('/') && !window.location.pathname.split('/').pop().includes('.')) {
                            var newUrl = window.location.pathname + '/' + window.location.search + window.location.hash;
                            window.history.replaceState(null, null, newUrl);
                            window.location.reload(); 
                        }
                    })();
                `}}></script>
            </head>
            <body class="dark-theme">
                <div id="app">
                    <Sidebar spec={spec} hierarchicalGroups={hierarchicalGroups} />
                    <MainContent allRoutes={allRoutes} config={config} spec={spec} />
                </div>
                <script src="explorer-client.mjs" type="module"></script>
            </body>
        </html>
    );
}


function Sidebar({ spec, hierarchicalGroups }: any) {
    // Helper to strip common prefix from path for display
    const stripPrefix = (path: string, prefix: string): string => {
        if (!prefix || prefix === '/') return path;
        if (path.startsWith(prefix)) {
            const stripped = path.substring(prefix.length);
            return stripped || '/';
        }
        return path;
    };

    // Helper to convert OpenAPI params to original format and highlight them
    const formatAndHighlightPath = (path: string): string => {
        // Convert {param} to :param
        const converted = path.replace(/\{([^}]+)\}/g, ':$1');

        // Highlight :param with color
        return converted.replace(/:([a-zA-Z0-9_]+)/g, '<span class="param-highlight">:$1</span>');
    };

    // Recursive function to render navigation nodes
    const renderNavNode = (node: GroupNode, depth: number = 0, commonPrefix: string = ''): any => {
        if (node.type === 'route') {
            const route = node.routes![0];
            const source = route.op['x-shokupan-source'] || route.op['x-source-info'];
            const isRuntime = route.op['x-source-info']?.isRuntime;
            const displayPath = stripPrefix(route.path, commonPrefix);
            const highlightedPath = formatAndHighlightPath(displayPath);

            return (
                <div class="nav-item-wrapper" style={`padding-left: ${depth * 12}px;`}>
                    <a
                        key={route.op.operationId}
                        href={`#${route.op.operationId}`}
                        class="nav-item"
                        data-id={route.op.operationId}
                        title={route.path}
                    >
                        <span class={`badge badge-${route.method.toUpperCase()}`}>{route.method.toUpperCase()}</span>
                        <span class="nav-label" dangerouslySetInnerHTML={{ __html: highlightedPath }}></span>
                        {isRuntime && (
                            <span class="nav-warning" title="Static Analysis Failed">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                    <line x1="12" y1="9" x2="12" y2="13"></line>
                                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                </svg>
                            </span>
                        )}
                    </a>
                    {source?.file && (
                        <a
                            href={`vscode://file/${source.file}:${source.line || 1}`}
                            class="nav-source-link"
                            title={`${source.file}:${source.line || 1}`}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="16 18 22 12 16 6"></polyline>
                                <polyline points="8 6 2 12 8 18"></polyline>
                            </svg>
                        </a>
                    )}
                </div>
            );
        } else if (node.type === 'subgroup') {
            return (
                <div class="nav-subgroup collapsed" style={`padding-left: ${depth * 12}px;`}>
                    <div class="nav-subgroup-title">
                        <span class="chevron">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </span>
                        <span>{node.name}</span>
                    </div>
                    <div class="nav-subgroup-items">
                        {node.children?.map((child: GroupNode) => renderNavNode(child, depth + 1, commonPrefix))}
                    </div>
                </div>
            );
        }
    };

    return (
        <aside class="sidebar">
            <div class="resize-handle"></div>
            <header class="sidebar-header">
                <button class="toggle-sidebar">☰</button>
                <h1>{spec.info?.title}</h1>
                <div class="version">{spec.info?.version}</div>
            </header>
            <div class="sidebar-collapse-trigger">➔</div>
            <nav class="nav-groups">
                {hierarchicalGroups.map((group: any) => (
                    <div class={`nav-group collapsed ${group.isBuiltin ? 'builtin-group' : ''}`} key={group.name}>
                        <div class="nav-group-title">
                            <span class="chevron">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                            </span>
                            {group.isBuiltin && (
                                <span class="builtin-icon" title="Built-in Plugin">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                                        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                                    </svg>
                                </span>
                            )}
                            {group.name}
                        </div>
                        <div class="nav-items">
                            {/* Render middleware first if any */}
                            {group.middleware && group.middleware.length > 0 && (
                                <div class="group-middleware">
                                    {group.middleware.map((mw: any) => (
                                        <a
                                            key={mw.id}
                                            href={`#middleware-${mw.id}`}
                                            class="nav-item middleware-nav-item"
                                            data-middleware-id={mw.id}
                                            title={mw.name}
                                        >
                                            <span class="middleware-icon">⚙</span>
                                            <span class="nav-label">{mw.name}</span>
                                            {mw.usedBy && mw.usedBy.length > 0 && (
                                                <span class="middleware-badge" title={`Used by ${mw.usedBy.length} routes`}>{mw.usedBy.length}</span>
                                            )}
                                            {mw.file && (
                                                <a
                                                    href={`vscode://file/${mw.file}:${mw.startLine || 1}`}
                                                    class="nav-source-link"
                                                    title={`${mw.file}:${mw.startLine || 1}`}
                                                >
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                        <polyline points="16 18 22 12 16 6"></polyline>
                                                        <polyline points="8 6 2 12 8 18"></polyline>
                                                    </svg>
                                                </a>
                                            )}
                                        </a>
                                    ))}
                                </div>
                            )}
                            {/* Then render routes */}
                            {group.children?.map((child: GroupNode) => renderNavNode(child, 0, group.commonPrefixPath || ''))}
                        </div>
                    </div>
                ))}
            </nav>


        </aside>
    );
}

function MainContent({ allRoutes, config, spec }: any) {
    // Serialize data for client-side consumption
    const explorerData = JSON.stringify({
        routes: allRoutes,
        config,
        info: spec.info,
        middlewareRegistry: spec['x-middleware-registry'] || {}
    });

    const safeJson = explorerData.replace(/<\/script>/g, '<\\/script>');

    return (
        <main class="content" id="main-content">
            <div id="ide-container">
                <div class="empty-state">Select a request to view details</div>
            </div>
            <script id="explorer-data" type="application/json" dangerouslySetInnerHTML={{ __html: safeJson }}></script>
        </main>
    );
}
