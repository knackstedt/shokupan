
/**
 * @jsx h
 * @jsxFrag Fragment
 */


export function AsyncApiApp({ spec, serverUrl, base, disableSourceView, navTree }: any) {
    return (
        <html lang="en">
            <head>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Shokupan AsyncAPI</title>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
                <link rel="stylesheet" href={`${base}/theme.css`} />
                <link rel="stylesheet" href={`${base}/style.css`} />
                <script dangerouslySetInnerHTML={{
                    __html: `
                    window.INITIAL_SPEC = ${JSON.stringify(spec)};
                    window.INITIAL_SERVER_URL = "${serverUrl}";
                    window.DISABLE_SOURCE_VIEW = ${JSON.stringify(disableSourceView)};
                `}} />
            </head>
            <body>
                <div class="app-container">
                    <Sidebar navTree={navTree} disableSourceView={disableSourceView} />

                    <div class="resizer" id="resizer-left"></div>

                    <MainContent />

                    <div class="resizer" id="resizer-right"></div>

                    <ConsolePanel serverUrl={serverUrl} />
                </div>

                <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
                <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
                <script src={`${base}/asyncapi-client.mjs`} type="module"></script>
            </body>
        </html>
    );
}

function Sidebar({ navTree, disableSourceView }: any) {
    return (
        <div class="sidebar scroller" id="sidebar">
            <div class="sidebar-header" style="display:flex; justify-content:space-between; align-items:center;">
                <h2>AsyncAPI</h2>
                <button id="btn-collapse-nav" class="btn-icon" title="Collapse Sidebar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
            </div>
            <div class="nav-list" id="nav-list">
                <NavNode node={navTree} level={0} disableSourceView={disableSourceView} />
            </div>
        </div>
    );
}

function NavNode({ node, level, disableSourceView }: any) {
    // Sort children
    const sortedEntries = Object.entries(node.children || {}).sort((a, b) => {
        const [aKey, aItem] = a as [string, any];
        const [bKey, bItem] = b as [string, any];

        // Prioritize Warnings
        const isWarningA = aItem.data?.op?.['x-warning'];
        const isWarningB = bItem.data?.op?.['x-warning'];
        if (isWarningA && !isWarningB) return -1;
        if (!isWarningA && isWarningB) return 1;

        if (aKey === bKey) return 0;
        if (aKey === 'Warning' || aKey === 'Warnings') return -1;
        if (bKey === 'Warning' || bKey === 'Warnings') return 1;
        if (aKey === 'Application') return -1;
        if (bKey === 'Application') return 1;

        // Directories/Groups first? Original code seemed to just sort by string, 
        // with specific exceptions.
        if (aKey[0] === '/') return 1;
        if (bKey[0] === '/') return -1;

        return aKey.localeCompare(bKey);
    });

    return (
        <>
            {sortedEntries.map(([key, item]: [string, any]) => {
                const hasChildren = Object.keys(item.children || {}).length > 0;

                if (level === 0) {
                    // Top Level Group
                    return (
                        <div key={key}>
                            <div class="group-label">{key}</div>
                            {hasChildren && (
                                <div class="tree-node" style="margin-left: 0">
                                    <NavNode node={item} level={level + 1} disableSourceView={disableSourceView} />
                                </div>
                            )}
                        </div>
                    );
                }

                // Nested Nodes
                const isLeaf = item.isLeaf;

                return (
                    <div key={key}>
                        {isLeaf ? (
                            <LeafNode item={item} label={key} disableSourceView={disableSourceView} />
                        ) : (
                            <div class="tree-item" style="color: var(--text-muted)">
                                <span class="tree-label">{key}</span>
                            </div>
                        )}

                        {hasChildren && (
                            <div class="tree-node">
                                <NavNode node={item} level={level + 1} disableSourceView={disableSourceView} />
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
}

function LeafNode({ item, label, disableSourceView }: any) {
    const isWarning = item.data?.op?.['x-warning'];
    const opId = item.data?.name; // Using name as ID for referencing
    const sourceInfo = item.data?.op?.['x-source-info'];

    let content;
    if (isWarning) {
        content = (
            <>
                <span style="margin-right: 6px;">⚠️</span>
                <span class="tree-label">{label}</span>
            </>
        );
    } else {
        const badgeText = item.data.type === 'publish' ? 'SEND' : 'RECV';
        content = (
            <>
                <span class={`badge badge-${badgeText}`}>{badgeText}</span>
                <span class="tree-label">{label}</span>
            </>
        );
    }

    return (
        <div class="tree-item" data-event={opId} style={isWarning ? "color: #fbbf24" : ""}>
            {content}
            {sourceInfo && !disableSourceView && (
                <a href={`vscode://file/${sourceInfo.file}:${sourceInfo.line}`}
                    class="source-link"
                    onClick={(e) => { e.stopPropagation(); }} // This won't work in SSR string, handled in client script
                    title={`${sourceInfo.file}:${sourceInfo.line}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:block">
                        <polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>
                    </svg>
                </a>
            )}
        </div>
    );
}


function MainContent() {
    return (
        <div id="main-wrapper" style="flex: 1; min-width: 0; position: relative; overflow: hidden;">
            <button id="btn-expand-nav" class="btn-icon floating-toggle left" title="Expand Sidebar" style="display:none;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </button>
            <button id="btn-expand-console" class="btn-icon floating-toggle right" title="Expand Console" style="display:none;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
            </button>

            <main class="main-content scroller" id="doc-panel" style="height: 100%;">
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                    </svg>
                    <h3>Select an event to view details</h3>
                </div>
            </main>
        </div>
    );
}

function ConsolePanel({ serverUrl }: any) {
    return (
        <div class="console-panel" id="console-panel">
            <div class="console-header">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                    <h3 style="margin:0; font-size:1rem;">Console</h3>
                    <div style="display:flex; gap: 4px;">
                        <button id="btn-maximize-console" class="btn-icon" title="Maximize Console">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            </svg>
                        </button>
                        <button id="btn-collapse-console" class="btn-icon" title="Collapse Console">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="connection-bar">
                    <select id="protocol">
                        <option value="ws">WS</option>
                        <option value="wss">WSS</option>
                        <option value="socket.io">Socket.IO</option>
                    </select>
                    <div style="width: 1px; background: rgba(255,255,255,0.1); margin: 2px 0;"></div>
                    <input type="text" id="url" value={serverUrl} />
                </div>
                <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px;">
                    <button id="connect-btn" class="btn">Connect</button>
                    <button id="clear-logs-btn" class="btn secondary" title="Clear Logs">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
                <div class="status-indicator">
                    <div id="status-dot" class="dot"></div>
                    <span id="connection-status">Disconnected</span>
                </div>
            </div>

            <div class="logs-container scroller" id="logs">
                <div class="log-shim" id="log-shim"></div>
            </div>

            <div class="compose-area">
                <div class="compose-header">
                    <span>Payload</span>
                    <span id="target-event" style="color: var(--primary);">--</span>
                </div>
                <div id="editor-container"></div>
                <div class="send-bar">
                    <button id="send-btn" class="btn">Send Message</button>
                </div>
            </div>
        </div>
    );
}

// Logic to build the tree from spec
export function buildNavTree(spec: any) {
    if (!spec || !spec.channels) return { children: {} };

    const root: any = { children: {} };

    Object.keys(spec.channels).forEach(name => {
        const ch = spec.channels[name];
        const op = ch.publish || ch.subscribe;
        const type = ch.publish ? 'publish' : 'subscribe';

        // Get Tag (Controller Name)
        const tag = (op.tags && op.tags.length > 0) ? op.tags[0].name : 'General';

        // Ensure Tag Group Exists
        if (!root.children[tag]) root.children[tag] = { children: {} };

        const parts = name.split(/[\.\/]/);
        let current = root.children[tag];

        parts.forEach((part, i) => {
            if (!current.children[part]) current.children[part] = { children: {} };
            current = current.children[part];

            if (i === parts.length - 1) {
                current.isLeaf = true;
                current.data = { name, op, type };
            }
        });
    });

    return root;
}
