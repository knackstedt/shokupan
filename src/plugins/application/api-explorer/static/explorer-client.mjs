// Client-side JavaScript for API Explorer

// Global State
let explorerData = { routes: [], config: {}, info: {} };
let currentRoute = null;
let currentEditors = { request: null, response: null, source: null };

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupSidebar();
    handleHashNavigation();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashNavigation);
});

function loadData() {
    const script = document.getElementById('explorer-data');
    if (script) {
        try {
            explorerData = JSON.parse(script.textContent);
        } catch (e) {
            console.error('Failed to parse explorer data', e);
        }
    }
}

function handleHashNavigation() {
    const hash = window.location.hash.slice(1);
    const container = document.getElementById('ide-container');

    // If no hash, show info/empty state
    if (!hash) {
        // Show info section if available, otherwise empty state
        if (explorerData.info) {
            container.innerHTML = renderInfoSection(explorerData.info);
        } else {
            container.innerHTML = '<div class="empty-state">Select a request to view details</div>';
        }
        return;
    }

    // Find route
    const route = explorerData.routes.find(r => r.op.operationId === hash);
    if (route) {
        currentRoute = route;
        renderRequestView(route, container);
    } else {
        container.innerHTML = `<div class="empty-state">Request not found: ${hash}</div>`;
    }
}

function renderInfoSection(info) {
    const { title, description } = info;
    return `
        <div class="info-section">
            <h1>${title || 'API Explorer'}</h1>
            ${description ? `<div class="markdown-content" data-markdown="true">${parseMarkdown(description)}</div>` : ''}
        </div>
    `;
}

// Helper to recursively render schema properties
function renderSchema(schema, depth = 0, isResponse = false) {
    if (!schema) return '';

    const indent = depth * 16;
    const type = schema.type || 'any';
    const required = schema.required || [];

    if (type === 'object' && schema.properties) {
        const props = Object.entries(schema.properties).map(([key, prop]) => {
            const isRequired = required.includes(key);
            const isUnknown = prop['x-unknown'] === true;
            const propType = isUnknown ? 'unknown' : (prop.type || 'any');
            const hasNested = (prop.type === 'object' && prop.properties) || (prop.type === 'array' && prop.items);

            // For responses, show "optional" for non-required fields
            // For requests, show "required" for required fields
            let badgeHtml = '';
            if (isResponse) {
                if (!isRequired) {
                    badgeHtml = '<div class="property-optional" style="margin-left: auto; font-size: 0.75rem; color: #9e9e9e; text-transform: uppercase; font-style: italic;">optional</div>';
                }
            } else {
                if (isRequired) {
                    badgeHtml = '<div class="property-required" style="margin-left: auto; font-size: 0.75rem; color: #f44336; text-transform: uppercase;">required</div>';
                }
            }

            return `
                <div style="margin-left: ${indent}px;">
                    <div class="property-heading" style="display: flex; align-items: center; gap: 8px; padding: 6px 0;">
                        <div class="property-name" style="font-family: monospace; font-weight: 500; color: var(--text-primary);">${key}</div>
                        <span class="property-detail" style="color: var(--text-secondary); font-size: 0.85rem;">
                            <span class="property-detail-value">${propType}</span>
                            ${isUnknown ? '<span class="unknown-marker" title="Type could not be determined statically" style="color: #ff9800; margin-left: 4px; cursor: help;">⚠️</span>' : ''}
                        </span>
                        ${badgeHtml}
                    </div>
                    ${prop.description ? `<div style="color: var(--text-secondary); font-size: 0.85rem; margin-left: 0; margin-top: -4px; margin-bottom: 4px;">${prop.description}</div>` : ''}
                    ${hasNested ? renderSchema(propType === 'array' ? prop.items : prop, depth + 1, isResponse) : ''}
                </div>
            `;
        }).join('');
        return props;
    } else if (type === 'array' && schema.items) {
        return `
            <div style="margin-left: ${indent}px; margin-top: 4px;">
                <div style="font-family: monospace; font-size: 0.85rem; color: var(--text-secondary);">
                    [array items]
                </div>
                ${renderSchema(schema.items, depth + 1, isResponse)}
            </div>
        `;
    }

    return '';
}

// Helper to highlight path operators
function highlightPath(path) {
    if (!path) return '';

    return path
        // Highlight {{substitution}} patterns
        .replace(/\{\{([^}]+)\}\}/g, '<span style="color: #4caf50;">{{$1}}</span>')
        // Highlight :parameter patterns
        .replace(/:([a-zA-Z0-9_]+)/g, '<span style="color: #2196f3;">:$1</span>')
        // Highlight * wildcards
        .replace(/\*/g, '<span style="color: #ff9800;">*</span>');
}

// --- IDE View Implementation ---

function renderRequestView(route, container) {
    const { method, path, op } = route;

    // Extract metadata
    const source = op['x-shokupan-source'];
    const middlewares = op['x-shokupan-middleware'] || [];
    const summary = op.summary || highlightPath(route.path);

    // Build tabs for Request Body, Params, Auth, etc.
    const uniqueParams = getUniqueParams(op);
    const hasBody = op.requestBody || (method !== 'get' && method !== 'delete');

    const html = `
        <div class="ide-view">
            <!-- Request Panel -->
            <div class="ide-panel request-panel">
                <div class="request-panel-header">
                    <div class="request-header-main">
                        <div class="request-url-bar">
                            <span class="url-method badge-${method}">${method.toUpperCase()}</span>
                            <div class="url-input" style="display: flex; align-items: center; font-family: monospace; white-space: nowrap; overflow-x: auto;">${highlightPath(path)}</div>
                        </div>
                        <button class="send-btn" id="btn-send">Send</button>
                    </div>
                    <div class="request-actions">
                        <button class="btn icon-btn copy-curl" title="Copy cURL">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            Copy cURL
                        </button>
                        <button class="btn icon-btn copy-fetch" title="Copy Fetch">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                            Copy Fetch
                        </button>
                    </div>
                </div>

                <div class="panel-tabs">
                    <div class="panel-tab active" data-tab="info">Info</div>
                    <div class="panel-tab" data-tab="params">Params</div>
                    <div class="panel-tab" data-tab="headers">Headers</div>
                    ${hasBody ? '<div class="panel-tab" data-tab="body">Body</div>' : ''}
                    <div class="panel-tab" data-tab="auth">Auth</div>
                </div>

                <div class="panel-content">
                    <div class="panel-section active" id="tab-info">
                        <div class="info-content" style="padding:16px; overflow-y:auto; flex:1;">
                            <div class="info-header">
                                <h2 class="info-title">${summary}</h2>
                                <div class="info-meta">
                                    ${op.tags ? `<div class="meta-row"><strong>Tags:</strong> ${op.tags.map(t => `<span class="badge">${t}</span>`).join('')}</div>` : ''}
                                </div>
                            </div>
                            
                            ${op.description ? `<div class="markdown-content" style="margin:16px 0;">${parseMarkdown(op.description)}</div>` : ''}
                            
                            ${op['x-warning'] ? `
                            <div class="alert alert-warning" style="margin: 16px 0; padding: 12px; background: rgba(255, 152, 0, 0.1); border-left: 3px solid #ff9800; border-radius: 4px;">
                                <strong style="color: #ff9800;">⚠️ Warning:</strong> ${op['x-warning-reason'] || 'This operation could not be fully analyzed statically'}
                            </div>
                            ` : ''}
                            
                            ${op.tags && op.tags.length > 0 ? `
                            <div class="hierarchy-section" style="margin:16px 0;">
                                <div style="display: flex; align-items: center; gap: 6px; font-size: 0.9rem; color: var(--text-secondary);">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M3 3v18h18"></path>
                                        <path d="M7 12h4"></path>
                                        <path d="M11 8v8"></path>
                                        <path d="M15 16h4"></path>
                                        <path d="M19 12v8"></path>
                                    </svg>
                                    ${op.tags.map((tag, idx) => `<span>${tag}</span>${idx < op.tags.length - 1 ? '<span style="opacity: 0.5;">›</span>' : ''}`).join('')}
                                </div>
                            </div>
                            ` : ''}
                            
                            ${middlewares.length > 0 ? `
                            <div class="middleware-section">
                                <h3>Middleware Pipeline</h3>
                                <div class="middleware-list" style="display: flex; flex-direction: column; gap: 4px;">
                                    ${middlewares.map((mw, idx) => `<div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="font-family: monospace; color: var(--text-secondary); min-width: 20px;">${idx + 1}.</span>
                                        <span class="middleware-badge" title="${mw.metadata ? JSON.stringify(mw.metadata).replace(/"/g, '&quot;') : ''}">${mw.name}</span>
                                    </div>`).join('')}
                                </div>
                            </div>
                            ` : ''}
                            
                            <div class="request-overview" style="margin:16px 0; background: var(--bg-secondary); border-radius: 8px; padding: 16px;">
                                <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 1rem;">Request</h3>
                                <div style="display: grid; gap: 8px; font-size: 0.9rem;">
                                    <div style="display: flex; gap: 8px;">
                                        <span class="badge badge-${method.toUpperCase()}">${method.toUpperCase()}</span>
                                        <code style="background: var(--bg-primary); padding: 2px 6px; border-radius: 4px;">${path}</code>
                                    </div>
                                    ${op.parameters && op.parameters.length > 0 ? `
                                    <div style="display: grid; grid-template-columns: 120px 1fr; gap: 8px;">
                                        <span style="color: var(--text-secondary);">Parameters:</span>
                                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                            ${op.parameters.filter(p => p.in === 'query').map(p =>
        `<span style="background: var(--bg-primary); padding: 2px 6px; border-radius: 4px; font-size: 0.85rem;">
                                                    <code>${p.name}</code>${p.required ? '*' : ''}
                                                </span>`
    ).join('')}
                                            ${op.parameters.filter(p => p.in === 'path').map(p =>
        `<span style="background: var(--bg-primary); padding: 2px 6px; border-radius: 4px; font-size: 0.85rem;">
                                                    <code>{${p.name}}</code>
                                                </span>`
    ).join('')}
                                        </div>
                                    </div>
                                    ` : ''}
                                    ${op.requestBody ? `
                                    <div style="display: grid; grid-template-columns: 120px 1fr; gap: 8px;">
                                        <span style="color: var(--text-secondary);">Body:</span>
                                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                            ${Object.keys(op.requestBody.content || {}).map(ct =>
        `<code style="background: var(--bg-primary); padding: 2px 6px; border-radius: 4px; font-size: 0.85rem;">${ct}</code>`
    ).join('')}
                                        </div>
                                    </div>
                                    ` : ''}
                                </div>
                                
                                <h3 style="margin-top: 16px; margin-bottom: 12px; font-size: 1rem;">Response</h3>
                                <div style="display: grid; gap: 12px; font-size: 0.9rem;">
                                    ${Object.entries(op.responses || {}).map(([code, resp]) => {
        const contentTypes = resp.content ? Object.keys(resp.content) : [];
        const firstContentType = contentTypes[0];
        const schema = firstContentType && resp.content[firstContentType]?.schema;

        return `
                                        <div style="border-left: 2px solid var(--text-secondary); padding-left: 12px;">
                                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                                <code style="background: var(--bg-primary); padding: 2px 8px; border-radius: 4px; font-weight: bold;">${code}</code>
                                                <span style="color: var(--text-secondary);">${resp.description || 'Response'}</span>
                                            </div>
                                            ${contentTypes.length > 0 ? `
                                                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">
                                                    ${contentTypes.map(ct =>
            `<code style="background: var(--bg-primary); padding: 2px 6px; border-radius: 4px; font-size: 0.8rem;">${ct}</code>`
        ).join('')}
                                                </div>
                                            ` : ''}
                                            ${schema ? `
                                                <div style="margin-top: 8px; background: var(--bg-primary); padding: 8px; border-radius: 4px;">
                                                    ${renderSchema(schema, 0, true)}
                                                </div>
                                            ` : ''}
                                        </div>
                                    `;
    }).join('')}
                                </div>
                            </div>
                            
                            
                            ${source ? `
                            <div class="source-section">
                                <h3 style="margin-bottom:8px; font-size:1.1rem; color:var(--text-primary);">Source Code</h3>
                                <div class="source-header" style="justify-content: space-between; margin-bottom: 8px; align-items: center;">
                                    <a href="vscode://file/${source.file}:${source.line}" class="doc-source-link" title="${source.file}:${source.line}">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px">
                                            <polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>
                                        </svg>
                                        ${source.file.split('/').pop()}:${source.line}
                                    </a>
                                    <button class="btn icon-btn" id="btn-source-fullscreen" title="Toggle Fullscreen">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                                        </svg>
                                    </button>
                                </div>
                                <div id="monaco-source-viewer" class="monaco-container"></div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="panel-section" id="tab-params">
                        ${uniqueParams.length > 0 ? renderParamsTable(uniqueParams) : '<div style="padding:16px; color:var(--text-secondary)">No parameters</div>'}
                    </div>
                    <div class="panel-section" id="tab-headers">
                        <div class="headers-editor" style="padding:16px;">
                            <div class="headers-table" id="req-headers-table">
                                <!-- Default headers -->
                                <div class="header-row">
                                    <div style="flex:1"><input type="text" class="header-name" value="Accept" placeholder="Header Name" /></div>
                                    <div style="flex:2"><input type="text" class="header-value" value="*/*" placeholder="Value" /></div>
                                    <button class="btn icon-btn remove-header" title="Remove Header">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                </div>
                                <div class="header-row">
                                    <div style="flex:1"><input type="text" class="header-name" value="Content-Type" placeholder="Header Name" /></div>
                                    <div style="flex:2"><input type="text" class="header-value" value="application/json" placeholder="Value" /></div>
                                    <button class="btn icon-btn remove-header" title="Remove Header">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                </div>
                            </div>
                            <button class="btn" id="btn-add-header" style="margin-top:12px; font-size:0.8rem">+ Add Header</button>
                        </div>
                    </div>
                    ${hasBody ? `
                    <div class="panel-section" id="tab-body" style="height:100%; display:none; flex-direction:column;">
                        <div id="monaco-request-body" class="monaco-container"></div>
                    </div>
                    ` : ''}
                    <div class="panel-section" id="tab-auth">
                        <div style="padding:16px; color:var(--text-secondary)">
                            No authentication configured
                        </div>
                    </div>
                </div>
            </div>

            <!-- Resizer -->
            <div class="panel-resizer"></div>

            <!-- Response Panel -->
            <div class="ide-panel response-panel">
                 <div class="response-status-bar">
                    <span style="margin-right:8px;">Response</span>
                    <span id="response-meta"></span>
                    <span style="flex: 1"></span>
                    <button class="btn" id="btn-download-response" style="display:none; margin-right:8px;">Download</button>
                    <button class="btn" id="btn-copy-response" style="display:none;">Copy</button>
                </div>
                <div class="monaco-container" id="monaco-response-body">
                    <div class="response-loader" style="display:none">Sending...</div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Setup tabs
    container.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
            container.querySelectorAll('.panel-section').forEach(s => {
                s.style.display = 'none';
                s.classList.remove('active');
            });

            tab.classList.add('active');
            const target = container.querySelector(`#tab-${tab.dataset.tab}`);
            if (target) {
                target.style.display = 'flex'; // Use flex for monaco containers to fill
                target.classList.add('active');

                // Layout monaco
                if (tab.dataset.tab === 'body' && currentEditors.request) {
                    currentEditors.request.layout();
                }
                if (tab.dataset.tab === 'info' && currentEditors.source) {
                    currentEditors.source.layout();
                }
            }
        });
    });

    // Initialize Monaco
    initMonaco();

    // Event Listeners
    document.getElementById('btn-send').addEventListener('click', () => doSendRequest(route));

    // Copy buttons
    container.querySelector('.copy-curl').addEventListener('click', () => {
        const text = buildCurl(route);
        copyToClipboard(text);
    });
    container.querySelector('.copy-fetch').addEventListener('click', () => {
        const text = buildFetch(route);
        copyToClipboard(text);
    });

    document.getElementById('btn-copy-response').addEventListener('click', () => {
        if (currentEditors.response) {
            copyToClipboard(currentEditors.response.getValue());
        }
    });

    // Headers Management
    const headersTable = container.querySelector('#req-headers-table');

    // Add Header
    container.querySelector('#btn-add-header').addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'header-row';
        row.innerHTML = `
            <div style="flex:1"><input type="text" class="header-name" placeholder="Header Name" /></div>
            <div style="flex:2"><input type="text" class="header-value" placeholder="Value" /></div>
            <button class="btn icon-btn remove-header" title="Remove Header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        headersTable.appendChild(row);
        setupRemoveHeaderBtn(row.querySelector('.remove-header'));
    });

    // Remove Header Delegate
    function setupRemoveHeaderBtn(btn) {
        btn.addEventListener('click', (e) => {
            e.currentTarget.closest('.header-row').remove();
        });
    }

    // Setup initial remove buttons
    container.querySelectorAll('.remove-header').forEach(setupRemoveHeaderBtn);

    // Source viewer fullscreen toggle
    const fullscreenBtn = document.getElementById('btn-source-fullscreen');
    if (fullscreenBtn) {
        const updateFullscreenIcon = (isFullscreen) => {
            const svg = fullscreenBtn.querySelector('svg');
            if (isFullscreen) {
                // Exit fullscreen icon (minimize)
                svg.innerHTML = '<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>';
            } else {
                // Enter fullscreen icon (maximize)
                svg.innerHTML = '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>';
            }
        };

        fullscreenBtn.addEventListener('click', () => {
            const sourceSection = container.querySelector('.source-section');
            if (sourceSection) {
                const isFullscreen = sourceSection.classList.toggle('fullscreen');
                updateFullscreenIcon(isFullscreen);

                // Update Monaco layout after transition
                setTimeout(() => {
                    if (currentEditors.source) currentEditors.source.layout();
                }, 300);
            }
        });

        // ESC key to exit fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const sourceSection = container.querySelector('.source-section');
                if (sourceSection && sourceSection.classList.contains('fullscreen')) {
                    sourceSection.classList.remove('fullscreen');
                    updateFullscreenIcon(false);
                    setTimeout(() => {
                        if (currentEditors.source) currentEditors.source.layout();
                    }, 300);
                }
            }
        });
    }

    // Populate Request Body if example exists
    if (hasBody && currentEditors.request) {
        currentEditors.request.setValue('{\n  \n}');
    }

    setupPanelResizer(container);
}

function setupPanelResizer(container) {
    const resizer = container.querySelector('.panel-resizer');
    const topPanel = container.querySelector('.request-panel');
    const bottomPanel = container.querySelector('.response-panel');

    if (!resizer || !topPanel || !bottomPanel) return;

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('active');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none'; // Prevent selection
        e.preventDefault();
    });

    // Use document for move/up to catch fast movements outside the element
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const containerRect = container.getBoundingClientRect();
        // Calculate percentage relative to container height
        // Offset by top of container
        const relativeY = e.clientY - containerRect.top;
        const percentage = (relativeY / containerRect.height) * 100;

        // Clamp between 20% and 80% to prevent full collapse
        const clamped = Math.max(20, Math.min(80, percentage));

        topPanel.style.flex = `0 0 ${clamped}%`;
        // bottomPanel is flex: 1, so it takes the rest
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Trigger monaco layout as size changed
            if (currentEditors.request) currentEditors.request.layout();
            if (currentEditors.response) currentEditors.response.layout();
            if (currentEditors.source) currentEditors.source.layout();
        }
    });
}

function renderParamsTable(params) {
    return `
        <div class="params-table">
            ${params.map(p => `
                <div class="param-row">
                    <div class="param-key">${p.name}${p.required ? '*' : ''}</div>
                    <div class="param-value">
                        <input type="text" name="param-${p.name}" data-in="${p.in}" placeholder="${p.description || ''}" />
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function getUniqueParams(op) {
    const uniqueParams = [];
    const seen = new Set();
    (op.parameters || []).forEach((p) => {
        const key = `${p.name}-${p.in}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueParams.push(p);
        }
    });
    return uniqueParams;
}

// --- Monaco Integration ---

function initMonaco() {
    if (typeof require === 'undefined') return;

    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });

    require(['vs/editor/editor.main'], function () {
        // Source Editor (In Info Tab)
        const sourceContainer = document.getElementById('monaco-source-viewer');
        if (sourceContainer && currentRoute && currentRoute.op['x-shokupan-source']) {
            const source = currentRoute.op['x-shokupan-source'];
            if (currentEditors.source) currentEditors.source.dispose();

            // Initial placeholder
            currentEditors.source = monaco.editor.create(sourceContainer, {
                value: '// Loading source...',
                language: 'typescript',
                theme: 'vs-dark',
                minimap: { enabled: false },
                lineNumbers: 'on',
                readOnly: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                glyphMargin: false, // Removed per request
                folding: false,     // Removed per request (extra gutter room)
                lineNumbersMinChars: 3,
                fontSize: 13,
                fontFamily: 'JetBrains Mono',
                renderLineHighlight: 'none'
            });

            // Lazy load source
            fetch(`_source?file=${encodeURIComponent(source.file)}`)
                .then(res => {
                    if (!res.ok) throw new Error(res.statusText);
                    return res.text();
                })
                .then(text => {
                    if (currentEditors.source) {
                        currentEditors.source.setValue(text);

                        const op = currentRoute.op;
                        const sourceInfo = op['x-source-info'] || {};
                        const highlights = sourceInfo.highlightLines || (source.line ? [source.line, source.line] : null);

                        const decorations = [];

                        // 1. Highlight the main range (Closure)
                        if (highlights) {
                            const startLine = highlights[0];
                            const endLine = highlights[1] || startLine;

                            if (startLine > 0) {
                                decorations.push({
                                    range: new monaco.Range(startLine, 1, endLine, 1),
                                    options: {
                                        isWholeLine: true,
                                        className: 'closure-highlight'
                                    }
                                });
                                currentEditors.source.revealLineInCenter(startLine);
                            }
                        }

                        // 2. Highlight specific statements (returns, emits)
                        if (sourceInfo.highlights) {
                            sourceInfo.highlights.forEach(h => {
                                if (h.startLine > 0) {
                                    let className = 'warning-line-highlight'; // verification default
                                    if (h.type === 'emit') className = 'emit-highlight';
                                    else if (h.type === 'return-success') className = 'success-line-highlight';
                                    else if (h.type === 'return-warning') className = 'warning-line-highlight';
                                    // Fallback for older 'return' type if any mixed
                                    else if (h.type === 'return') className = 'warning-line-highlight';

                                    decorations.push({
                                        range: new monaco.Range(h.startLine, 1, h.endLine, 1),
                                        options: {
                                            isWholeLine: true,
                                            className: className
                                            // glyphMarginClassName removed as glyphMargin is false
                                        }
                                    });
                                }
                            });
                        }

                        currentEditors.source.deltaDecorations([], decorations);
                    }
                })
                .catch(err => {
                    if (currentEditors.source) {
                        currentEditors.source.setValue(`// Failed to load source: ${err.message}`);
                    }
                });
        }

        // Request Editor
        const reqContainer = document.getElementById('monaco-request-body');
        if (reqContainer) {
            if (currentEditors.request) currentEditors.request.dispose();

            currentEditors.request = monaco.editor.create(reqContainer, {
                value: '',
                language: 'json',
                theme: 'vs-dark',
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                glyphMargin: false,
                folding: true,
                fontSize: 13,
                fontFamily: 'JetBrains Mono',
                renderLineHighlight: 'none'
            });
        }

        // Response Editor
        const resContainer = document.getElementById('monaco-response-body');
        if (resContainer) {
            if (currentEditors.response) currentEditors.response.dispose();

            currentEditors.response = monaco.editor.create(resContainer, {
                value: '// Response will appear here',
                language: 'json',
                theme: 'vs-dark',
                minimap: { enabled: false },
                lineNumbers: 'on',
                readOnly: true,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                glyphMargin: false,
                fontSize: 13,
                fontFamily: 'JetBrains Mono'
            });
        }
    });
}

// --- Request Construction Helper ---

function getRequestData(route) {
    const { method, path } = route;
    const urlObj = new URL(path, window.location.origin);
    const headers = {};

    // Collect Params
    document.querySelectorAll(`input[name^="param-"]`).forEach(input => {
        const name = input.name.replace('param-', '');
        const val = input.value;
        const place = input.dataset.in; // query, path, header

        if (!val) return;

        if (place === 'query') urlObj.searchParams.set(name, val);
        else if (place === 'header') headers[name] = val;
        else if (place === 'path') urlObj.pathname = urlObj.pathname.replace(`{${name}}`, encodeURIComponent(val));
    });

    // Collect Headers
    document.querySelectorAll('.header-row').forEach(row => {
        const nameInput = row.querySelector('.header-name');
        const valueInput = row.querySelector('.header-value');
        if (nameInput && valueInput && nameInput.value) {
            headers[nameInput.value] = valueInput.value;
        }
    });

    // Body
    let body = null;
    if (currentEditors.request) {
        try {
            const bodyVal = currentEditors.request.getValue();
            if (bodyVal && bodyVal.trim()) {
                body = bodyVal;
            }
        } catch (e) { }
    }

    return { url: urlObj.toString(), method: method.toUpperCase(), headers, body };
}

// --- Request Execution ---

async function doSendRequest(route) {
    const { url, method, headers, body } = getRequestData(route);
    const options = { method, headers };

    // Only include body for methods that support it (not GET/HEAD)
    if (body && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
        options.body = body;
    }

    // UI Updates
    const responseMeta = document.getElementById('response-meta');
    const loader = document.querySelector('.response-loader');
    if (loader) loader.style.display = 'flex';
    if (currentEditors.response) currentEditors.response.setValue('// Loading...');

    const startTime = Date.now();
    try {
        const res = await fetch(url, options);
        const duration = Date.now() - startTime;

        // Handle content
        const contentType = res.headers.get('content-type') || '';
        let bodyContent = '';
        let isBinary = false;

        if (contentType.includes('application/json')) {
            const json = await res.json();
            bodyContent = JSON.stringify(json, null, 2);
            if (currentEditors.response) monaco.editor.setModelLanguage(currentEditors.response.getModel(), 'json');
        } else if (contentType.includes('text/') || contentType.includes('xml') || contentType.includes('javascript') || contentType.includes('html')) {
            bodyContent = await res.text();
            if (currentEditors.response) monaco.editor.setModelLanguage(currentEditors.response.getModel(), 'html'); // or text
        } else {
            // Binary / other
            isBinary = true;
            bodyContent = `[Binary Content: ${contentType}]`;
            const blob = await res.blob();
            setupDownloadButton(blob, 'response');
        }

        // Update Editor
        if (currentEditors.response) currentEditors.response.setValue(bodyContent);

        // Update Buttons
        const copyBtn = document.getElementById('btn-copy-response');
        const dlBtn = document.getElementById('btn-download-response');

        if (!isBinary) {
            if (copyBtn) copyBtn.style.display = 'block';
            if (dlBtn) dlBtn.style.display = 'block';

            // Create blob for download text
            const blob = new Blob([bodyContent], { type: contentType || 'text/plain' });
            setupDownloadButton(blob, 'response.' + (contentType.includes('json') ? 'json' : 'txt'));
        } else {
            if (copyBtn) copyBtn.style.display = 'none';
            if (dlBtn) dlBtn.style.display = 'block';
        }

        // Status Bar
        if (responseMeta) {
            responseMeta.innerHTML = `
                <span class="${res.ok ? 'success' : 'error'}" style="${res.ok ? 'color:#4caf50' : 'color:#f44336'}">${res.status} ${res.statusText}</span>
                <span style="margin-left:12px; opacity:0.7">${duration}ms</span>
                <span style="margin-left:12px; opacity:0.7">${formatSize(bodyContent.length)}</span>
            `;
        }

    } catch (err) {
        if (currentEditors.response) currentEditors.response.setValue(`Error: ${err.message}`);
        if (responseMeta) responseMeta.innerHTML = `<span style="color:#f44336">Error</span>`;
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function setupDownloadButton(blob, filename) {
    const btn = document.getElementById('btn-download-response');
    if (!btn) return;

    // Clone to remove old listener
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.onclick = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    newBtn.style.display = 'inline-block';
}

function buildCurl(route) {
    const { url, method, headers, body } = getRequestData(route);
    let curl = `curl -X ${method} "${url}"`;
    for (const [k, v] of Object.entries(headers)) {
        curl += ` \\\n  -H "${k}: ${v}"`;
    }
    if (body) {
        // Escape quotes? Simplification
        curl += ` \\\n  -d '${body.replace(/'/g, "'\\''")}'`;
    }
    return curl;
}

function buildFetch(route) {
    const { url, method, headers, body } = getRequestData(route);
    const options = {
        method: method,
        headers: headers,
        body: body ? JSON.parse(body) : undefined // simplified, assuming JSON
    };
    // If not JSON, leave body as string
    if (body && options.body === undefined) options.body = body;

    return `fetch("${url}", ${JSON.stringify(options, null, 2)})`;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Optional toast
    });
}


function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


// --- Helpers ---
function parseMarkdown(text) {
    if (!text) return '';
    if (typeof marked === 'undefined') return text;

    const renderer = new marked.Renderer();
    const originalBlockquote = renderer.blockquote.bind(renderer);

    renderer.blockquote = (quote) => {
        const match = quote.match(/^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/);
        if (match) {
            const type = match[1];
            const content = quote.replace(/^<p>\[!.*?\]\s*/, '');
            return `<div class="markdown-alert ${type.toLowerCase()}">
                        <div class="markdown-alert-title">${type}</div>
                        ${content}
                    </div>`;
        }
        return originalBlockquote(quote);
    };

    return marked.parse(text, { renderer });
}

function setupSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Collapsible Groups (top-level)
    document.querySelectorAll('.nav-group-title').forEach(title => {
        title.addEventListener('click', (e) => {
            const group = e.currentTarget.parentElement;
            group.classList.toggle('collapsed');
        });
    });

    // Collapsible Subgroups (nested)
    document.querySelectorAll('.nav-subgroup-title').forEach(title => {
        title.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent bubbling to parent group
            const subgroup = e.currentTarget.parentElement;
            subgroup.classList.toggle('collapsed');
        });
    });
}
