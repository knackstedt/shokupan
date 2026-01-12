/** @jsx h */

export function ApiExplorerApp({ spec, asyncSpec, config }: any) {
    // Build hierarchy: router -> controller -> routes
    const hierarchy = new Map();
    const routerMeta = new Map(); // Store metadata for routers/groups

    // Helper to add route to hierarchy
    const addRoute = (groupKey: string, route: any) => {
        if (!hierarchy.has(groupKey)) {
            hierarchy.set(groupKey, []);
        }
        hierarchy.get(groupKey).push(route);
    };

    // Helper to determine group key
    const getGroupKey = (op: any, source: any) => {
        // 1. Prefer explicit tags if they look like "titles" (not paths)
        if (op.tags && op.tags.length > 0) {
            const tag = typeof op.tags[0] === 'string' ? op.tags[0] : op.tags[0].name;
            if (!tag.startsWith('/')) return tag;
        }

        // 2. Class Name
        if (source?.className) return source.className;

        // 3. File Name (Pretty)
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

    Object.entries(spec.paths || {}).forEach(([path, methods]: [string, any]) => {
        Object.entries(methods).forEach(([method, op]: [string, any]) => {
            if (!op.operationId) {
                op.operationId = `${method}-${path.replace(/\//g, '-').replace(/[{}:]/g, '')}`;
            }

            const route = { method, path, op };
            const source = (op as any)['x-shokupan-source'];
            const groupKey = getGroupKey(op, source);

            addRoute(groupKey, route);
        });
    });

    // Merge AsyncAPI channels into hierarchy
    Object.entries(asyncSpec?.channels || {}).forEach(([name, ch]: [string, any]) => {
        const operations = [];
        // Map to SEND/RECV per user request
        if (ch.publish) operations.push({ method: 'recv', op: ch.publish }); // App publishes, Client RECVs
        if (ch.subscribe) operations.push({ method: 'send', op: ch.subscribe }); // App subscribes, Client SENDs

        operations.forEach(({ method, op }) => {
            if (!op.operationId) op.operationId = `${method}-${name.replace(/[^a-zA-Z0-9]/g, '-')}`;

            const route = { method, path: name, op };
            const source = (op as any)['x-shokupan-source'];
            console.log(`[AsyncAPI Debug] ${name} ${method}:`, { source, tags: op.tags });
            const groupKey = getGroupKey(op, source);

            addRoute(groupKey, route);
        });
    });

    // Sort groups
    const sortedGroups = Array.from(hierarchy.entries())
        .map(([name, routes]) => {
            // Sort routes within group: simple methods first, then by path length
            routes.sort((a: any, b: any) => {
                return a.path.localeCompare(b.path);
            });
            return [name, routes] as [string, any[]];
        })
        .sort(([a], [b]) => {
            if (a === 'Ungrouped') return 1;
            if (b === 'Ungrouped') return -1;
            return a.localeCompare(b);
        });

    // Flatten for client-side data
    const allRoutes = sortedGroups.flatMap(([_, routes]) => routes);

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
                    <Sidebar spec={spec} sortedGroups={sortedGroups} />
                    <MainContent allRoutes={allRoutes} config={config} spec={spec} />
                </div>
                <script src="explorer-client.mjs" type="module"></script>
            </body>
        </html>
    );
}

function Sidebar({ spec, sortedGroups }: any) {
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
                {sortedGroups.map(([groupName, routes]: [string, any[]]) => (
                    <div class="nav-group collapsed" key={groupName}>
                        <div class="nav-group-title">
                            <span class="chevron">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                            </span> {groupName}
                        </div>
                        <div class="nav-items">
                            {routes.map((route: any) => {
                                const label = route.op.summary || route.op.title || route.path;
                                const isRuntime = route.op['x-source-info']?.isRuntime;
                                return (
                                    <a key={route.op.operationId} href={`#${route.op.operationId}`} class="nav-item" data-id={route.op.operationId} title={route.path}>
                                        <span class={`method-badge ${route.method}`}>{route.method.toUpperCase()}</span>
                                        <span class="nav-label">{label}</span>
                                        {isRuntime && (
                                            <span class="nav-warning" title="Static Analysis Failed" style="margin-left: auto; color: orange;">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                                    <line x1="12" y1="9" x2="12" y2="13"></line>
                                                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                                </svg>
                                            </span>
                                        )}
                                    </a>
                                );
                            })}
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
        info: spec.info
    });

    const safeJson = explorerData.replace(/<\/script>/g, '<\\/script>');

    return (
        <main class="content" id="main-content">
            <div class="info-section-placeholder"></div>
            <div id="virtual-scroller-container"></div>
            <script id="explorer-data" type="application/json" dangerouslySetInnerHTML={{ __html: safeJson }}></script>
        </main>
    );
}
