/** @jsx h */

export function ApiExplorerApp({ spec, asyncSpec, config }: any) {
    // Build hierarchy: router -> controller -> routes
    const hierarchy = new Map();

    Object.entries(spec.paths || {}).forEach(([path, methods]: [string, any]) => {
        Object.entries(methods).forEach(([method, op]: [string, any]) => {
            if (!op.operationId) {
                op.operationId = `${method}-${path.replace(/\//g, '-').replace(/[{}:]/g, '')}`;
            }

            const route = { method, path, op };
            const source = (op as any)['x-shokupan-source'];

            // Determine group key (controller/router name)
            let groupKey = 'Ungrouped';
            if (op.tags && op.tags.length > 0) {
                groupKey = op.tags[0];
            } else if (source?.className) {
                groupKey = source.className;
            }

            if (!hierarchy.has(groupKey)) {
                hierarchy.set(groupKey, []);
            }
            hierarchy.get(groupKey).push(route);
        });
    });

    // Merge AsyncAPI channels into hierarchy
    Object.entries(asyncSpec?.channels || {}).forEach(([name, ch]: [string, any]) => {
        const operations = [];
        if (ch.publish) operations.push({ method: 'pub', op: ch.publish });
        if (ch.subscribe) operations.push({ method: 'sub', op: ch.subscribe });

        operations.forEach(({ method, op }) => {
            if (!op.operationId) op.operationId = `${method}-${name.replace(/[^a-zA-Z0-9]/g, '-')}`;

            const route = { method, path: name, op };

            // Determine group key
            let groupKey = 'Ungrouped';
            // AsyncAPI uses Tag objects { name: string }, OpenAPI uses strings
            if (op.tags && op.tags.length > 0) {
                const tag = op.tags[0];
                groupKey = typeof tag === 'string' ? tag : tag.name;
            }

            if (!hierarchy.has(groupKey)) {
                hierarchy.set(groupKey, []);
            }
            hierarchy.get(groupKey).push(route);
        });
    });

    const sortedGroups = Array.from(hierarchy.entries()).sort(([a], [b]) => a.localeCompare(b));

    // Consolidate all operations for MainContent
    const allRoutes = Array.from(hierarchy.values()).flat();

    return (
        <html lang="en">
            <head>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>{spec.info?.title || 'API Explorer'}</title>
                <link rel="stylesheet" href="theme.css" />
                <link rel="stylesheet" href="style.css" />
                <script src="https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js"></script>
                <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
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
                    <div class="nav-group" key={groupName}>
                        <div class="nav-group-title">{groupName}</div>
                        <div class="nav-items">
                            {routes.map((route: any) => (
                                <a key={route.op.operationId} href={`#${route.op.operationId}`} class="nav-item">
                                    <span class={`method-badge ${route.method}`}>{route.method.toUpperCase()}</span>
                                    <span class="path">{route.path}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                ))}
            </nav>
        </aside>
    );
}

function MainContent({ allRoutes, config, spec }: any) {
    return (
        <main class="content">
            <div class="info-section">
                <h1>{spec.info?.title}</h1>
                {spec.info?.description && <div class="markdown-content" data-markdown="true">{spec.info.description}</div>}
            </div>
            <div class="operations">
                {allRoutes.map((route: any) => <OperationCard key={route.op.operationId} route={route} config={config} />)}
            </div>
        </main>
    );
}

function OperationCard({ route, config }: any) {
    const { method, path, op } = route;
    const shokupanSource = (op as any)['x-shokupan-source'];
    const sourceInfo = (op as any)['x-source-info'];

    const uniqueParams: any[] = [];
    const seen = new Set();
    (op.parameters || []).forEach((p: any) => {
        const key = `${p.name}-${p.in}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueParams.push(p);
        }
    });

    // Extract code from description (embedded in markdown code blocks)
    let sourceCode = sourceInfo?.snippet || shokupanSource?.code || null;
    let cleanDescription = op.description || '';

    if (cleanDescription) {
        const codeBlockMatch = cleanDescription.match(/```(?:typescript|javascript)\n([\s\S]*?)\n```/);
        if (codeBlockMatch) {
            sourceCode = codeBlockMatch[1];
            // Remove code block but keep warning messages
            cleanDescription = cleanDescription.replace(/```(?:typescript|javascript)\n[\s\S]*?\n```/, '').trim();
        }
    }

    // Build "View in Editor" link - always use vscode://
    let viewInEditorLink = null;
    if (shokupanSource?.file) {
        const file = shokupanSource.file;
        const line = shokupanSource.line || 1;
        viewInEditorLink = `vscode://file/${file}:${line}`;
    }

    return (
        <section id={op.operationId} class="operation-card">
            <header class="op-header">
                <div class="op-title">
                    <span class={`method-badge large ${method}`}>{method.toUpperCase()}</span>
                    <h2 class="path">{path}</h2>
                </div>
                <div class="op-summary">{op.summary}</div>
                {viewInEditorLink && (
                    <div style="margin-top: 0.5rem">
                        <a href={viewInEditorLink} style="color: var(--color-accent); font-size: 0.9rem; text-decoration: none">
                            📝 View in Editor
                        </a>
                    </div>
                )}
            </header>
            {cleanDescription && <div class="op-description markdown-content" data-markdown="true">{cleanDescription}</div>}

            {sourceCode && (
                <div class="code-section">
                    <h4>Source Code</h4>
                    <div class="monaco-editor read-only" data-code={Buffer.from(sourceCode, 'utf-8').toString('base64')} data-language="typescript"></div>
                </div>
            )}

            <div class="tester-section">
                <h3>Try It Out</h3>
                <form class="tester-form" data-method={method} data-path={path}>
                    {uniqueParams.length > 0 && (
                        <div class="params-table">
                            <h4>Parameters</h4>
                            {uniqueParams.map((p) => (
                                <div key={p.name} class="param-row">
                                    <label>
                                        <span class="param-name">{p.name}</span>
                                        <span class="param-in">({p.in})</span>
                                        {p.required && <span class="required">*</span>}
                                    </label>
                                    <input type="text" name={p.name} data-in={p.in} placeholder={p.description || ''} />
                                </div>
                            ))}
                        </div>
                    )}
                    <div class="actions">
                        <button type="submit" class="btn primary">Send Request</button>
                        <button type="button" class="btn copy-curl">Copy as cURL</button>
                        <button type="button" class="btn copy-fetch">Copy as Fetch</button>
                    </div>
                </form>
                <div class="response-viewer" style="display: none">
                    <h4>Response</h4>
                    <div class="status-bar">
                        <span class="status-code"></span>
                        <span class="duration"></span>
                    </div>
                    <div class="monaco-response" data-response="true"></div>
                </div>
            </div>
        </section>
    );
}
