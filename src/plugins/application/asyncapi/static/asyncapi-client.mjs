const state = {
    socket: null,
    isConnected: false,
    shouldAutoReconnect: true,
    reconnectTimer: null,
    protocol: 'ws',
    spec: window.INITIAL_SPEC || null,
    editor: null,
    selectedEvent: null,
    logEntries: [],
    logAutoScroll: true,
    isConsoleMaximized: false,
    disableSourceView: !!window.DISABLE_SOURCE_VIEW,
    // Layout State names
    STORAGE_KEYS: {
        SIDEBAR_WIDTH: 'asyncapi_sidebar_width',
        CONSOLE_WIDTH: 'asyncapi_console_width',
        NAV_COLLAPSED: 'asyncapi_nav_collapsed',
        CONSOLE_COLLAPSED: 'asyncapi_console_collapsed',
        CONSOLE_MAXIMIZED: 'asyncapi_console_maximized'
    }
};

const STORAGE_PREFIX = 'shokupan:asyncapi:';

function saveState(key, value) {
    try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch (e) {
        console.warn('Failed to save state', e);
    }
}

function getState(key, defaultValue) {
    try {
        const item = localStorage.getItem(STORAGE_PREFIX + key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

const els = {
    url: document.getElementById('url'),
    protocol: document.getElementById('protocol'),
    connectBtn: document.getElementById('connect-btn'),
    clearBtn: document.getElementById('clear-logs-btn'),
    statusText: document.getElementById('connection-status'),
    statusDot: document.getElementById('status-dot'),
    logs: document.getElementById('logs'),
    logShim: document.getElementById('log-shim'),
    sendBtn: document.getElementById('send-btn'),
    navList: document.getElementById('nav-list'),
    docPanel: document.getElementById('doc-panel'),
    targetEventLabel: document.getElementById('target-event'),
    targetEventLabel: document.getElementById('target-event'),
    showSourceToggle: document.getElementById('show-source-toggle'),
    btnCollapseNav: document.getElementById('btn-collapse-nav'),
    btnExpandNav: document.getElementById('btn-expand-nav'),
    btnCollapseConsole: document.getElementById('btn-collapse-console'),
    btnExpandConsole: document.getElementById('btn-expand-console'),
    sidebar: document.getElementById('sidebar'),
    resizerLeft: document.getElementById('resizer-left'),
    resizerRight: document.getElementById('resizer-right'),
    resizerRight: document.getElementById('resizer-right'),
    consolePanel: document.getElementById('console-panel'),
    mainWrapper: document.getElementById('main-wrapper'),
    btnMaximizeConsole: document.getElementById('btn-maximize-console')
};

// Resizers
// Resizers
function initResizers() {
    const setup = (id, varName, isLeft) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const root = document.documentElement;
            const startX = e.clientX;
            const startW = parseInt(getComputedStyle(root).getPropertyValue(varName), 10);
            document.body.style.cursor = 'col-resize';
            el.classList.add('resizing');

            const onMove = (em) => {
                const diff = em.clientX - startX;
                const newW = isLeft ? startW + diff : startW - diff;
                if (newW > 100 && newW < 800) root.style.setProperty(varName, newW + 'px');
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                el.classList.remove('resizing');

                // Save new width
                const finalW = parseInt(getComputedStyle(root).getPropertyValue(varName), 10);
                saveState(varName === '--sidebar-width' ? state.STORAGE_KEYS.SIDEBAR_WIDTH : state.STORAGE_KEYS.CONSOLE_WIDTH, finalW);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    };
    setup('resizer-left', '--sidebar-width', true);
    setup('resizer-right', '--console-width', false);
}

function toggleConsoleMaximize(save = true) {
    if (save) state.isConsoleMaximized = !state.isConsoleMaximized;
    // implied else: state already toggled if called from restore

    const btn = els.btnMaximizeConsole;

    if (state.isConsoleMaximized) {
        // Maximize
        els.mainWrapper.style.display = 'none';
        els.resizerRight.style.display = 'none';
        els.consolePanel.style.flex = '1';
        els.consolePanel.style.width = 'auto'; // Reset width if resized

        // Update Icon to Restore
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
        btn.title = "Restore Console";
    } else {
        // Restore
        els.mainWrapper.style.display = '';
        els.resizerRight.style.display = 'block';
        els.consolePanel.style.flex = ''; // Revert to CSS default
        els.consolePanel.style.width = ''; // Revert width

        // Update Icon to Maximize
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
        btn.title = "Maximize Console";
    }

    if (save) {
        saveState(state.STORAGE_KEYS.CONSOLE_MAXIMIZED, state.isConsoleMaximized);
    }
}

function restoreLayout() {
    const root = document.documentElement;

    // Widths
    const sidebarW = getState(state.STORAGE_KEYS.SIDEBAR_WIDTH, null);
    if (sidebarW) root.style.setProperty('--sidebar-width', sidebarW + 'px');

    const consoleW = getState(state.STORAGE_KEYS.CONSOLE_WIDTH, null);
    if (consoleW) root.style.setProperty('--console-width', consoleW + 'px');

    // Nav State
    const navCollapsed = getState(state.STORAGE_KEYS.NAV_COLLAPSED, false);
    if (navCollapsed && els.btnCollapseNav) {
        els.sidebar.style.display = 'none';
        els.resizerLeft.style.display = 'none';
        els.btnExpandNav.style.display = 'flex';
        // Ensure collapse button is hidden? Stylesheet handles it via display:none on expand usually? 
        // Based on original logic:
        // collapse click -> sidebar none, resizer none, expand flex.
        // expand click -> sidebar flex, resizer block, expand none.
        // We assume collapse btn is always visible when sidebar is visible.
    }

    // Console State
    const consoleCollapsed = getState(state.STORAGE_KEYS.CONSOLE_COLLAPSED, false);
    if (consoleCollapsed && els.btnCollapseConsole) {
        els.consolePanel.style.display = 'none';
        els.resizerRight.style.display = 'none';
        els.btnExpandConsole.style.display = 'flex';
    }

    // Maximize State
    const consoleMaximized = getState(state.STORAGE_KEYS.CONSOLE_MAXIMIZED, false);
    if (consoleMaximized && els.btnMaximizeConsole && !consoleCollapsed) { // Don't maximize if collapsed?
        state.isConsoleMaximized = true;
        toggleConsoleMaximize(false);
    }
}

// Hydrate Navigation
function hydrateNav() {
    const items = document.querySelectorAll('.tree-item[data-event]');
    items.forEach(el => {
        el.addEventListener('click', () => {
            const eventName = el.dataset.event;
            selectEvent(eventName, el);
        });
    });
}

function resolveItem(name) {
    if (!state.spec || !state.spec.channels) return null;
    const ch = state.spec.channels[name];
    if (!ch) return null;

    // Logic matching buildNavTree:
    const op = ch.publish || ch.subscribe;
    const type = ch.publish ? 'publish' : 'subscribe';
    return { name, op, type };
}

// Initialize Monaco
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
    initResizers(); // Init resizers
    hydrateNav();   // Hydrate pre-rendered nav

    // Virtual scroll listener
    els.logs.addEventListener('scroll', () => {
        const diff = els.logs.scrollHeight - els.logs.scrollTop - els.logs.clientHeight;
        // User requested 10px threshold for sticky behavior
        state.logAutoScroll = diff <= 10;
        renderLogs();
    });

    els.clearBtn.onclick = () => {
        state.logEntries = [];
        renderLogs();
    };

    state.editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: '{\n    "key": "value"\n}',
        language: 'json',
        theme: 'vs-dark',
        minimap: { enabled: false },
        lineNumbers: 'off',
        folding: false,
        glyphMargin: false,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 0,
        padding: { top: 10, bottom: 10 },
        fontSize: 12,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        backgroundColor: 'transparent'
    });

    // Auto-connect if URL is present (or wait for user?)
    // Original script called connect() immediately.
    // Toggles

    if (els.btnCollapseNav) els.btnCollapseNav.onclick = () => {
        els.sidebar.style.display = 'none';
        els.resizerLeft.style.display = 'none';
        els.btnExpandNav.style.display = 'flex';
        saveState(state.STORAGE_KEYS.NAV_COLLAPSED, true);
    };
    if (els.btnExpandNav) els.btnExpandNav.onclick = () => {
        els.sidebar.style.display = 'flex';
        els.resizerLeft.style.display = 'block';
        els.btnExpandNav.style.display = 'none';
        saveState(state.STORAGE_KEYS.NAV_COLLAPSED, false);
    };

    if (els.btnCollapseConsole) els.btnCollapseConsole.onclick = () => {
        // If maximized, restore first to ensure main content/buttons are visible
        if (state.isConsoleMaximized) toggleConsoleMaximize();

        els.consolePanel.style.display = 'none';
        els.resizerRight.style.display = 'none';
        els.btnExpandConsole.style.display = 'flex';
        saveState(state.STORAGE_KEYS.CONSOLE_COLLAPSED, true);
    };
    if (els.btnExpandConsole) els.btnExpandConsole.onclick = () => {
        els.consolePanel.style.display = 'flex';
        els.resizerRight.style.display = 'block';
        els.btnExpandConsole.style.display = 'none';
        saveState(state.STORAGE_KEYS.CONSOLE_COLLAPSED, false);

        // Reset maximize state if it was maximized (handled by collapse logic mostly, but good to be safe)
        if (state.isConsoleMaximized) toggleConsoleMaximize();
    };

    if (els.btnMaximizeConsole) els.btnMaximizeConsole.onclick = () => toggleConsoleMaximize(true);

    restoreLayout();

    connect();
});

/* ================= Targeted Highlighting Helper ================= */
function applyEmitHighlight(decorations, src) {
    // Apply emit-specific highlighting if available
    if (src.emitHighlightLines) {
        let startLine = src.emitHighlightLines[0];
        let endLine = src.emitHighlightLines[1];

        if (startLine > 0) {
            decorations.push({
                range: new monaco.Range(startLine, 1, endLine, 1),
                options: {
                    isWholeLine: true,
                    className: 'emit-highlight'
                }
            });
        }
    }
}

/* ================= Schema & Doc Rendering ================= */
async function selectEvent(name, el) {
    const item = resolveItem(name);
    if (!item) return;
    document.querySelectorAll('.tree-item').forEach(n => n.classList.remove('active'));
    if (el) el.classList.add('active');

    state.selectedEvent = item;
    els.targetEventLabel.innerText = item.name;

    const op = item.op;
    const isWarning = !!op['x-warning'];
    // Fix: Leave description blank if missing, don't fallback to summary for body
    const desc = op.description || '';
    const payload = op.message?.payload;

    if (isWarning) {
        const sourceInfos = Array.isArray(op['x-source-info']) ? op['x-source-info'] : (op['x-source-info'] ? [op['x-source-info']] : []);

        let sourceLinksHtml = '';
        if (!state.disableSourceView && sourceInfos.length > 0) {
            sourceLinksHtml = sourceInfos.map(s => {
                const filename = s.file ? s.file.split('/').pop() : 'unknown';
                return `<a href="vscode://file/${s.file}:${s.line}" style="color: #fbbf24; text-decoration: none; display: block;" class="code-link">
                            <code style="font-family: 'JetBrains Mono', monospace; background: rgba(251, 191, 36, 0.1); padding: 2px 4px; border-radius: 4px;">${escapeHtml(filename)}:${s.line}</code>
                        </a>`;
            }).join('');
        }

        els.docPanel.innerHTML = `
            <div class="doc-header" style="border-bottom: 2px solid #fbbf24;">
                <h1 class="doc-title" style="color: #fbbf24;">⚠️ ${item.name}</h1>
                <div class="doc-meta">
                    <span class="badge warning" style="background: #fbbf24; color: #000; font-size: 0.8rem; padding: 4px 8px;">WARNING</span>
                </div>
            </div>
            <div class="doc-body">
                <div class="alert warning" style="background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 6px; padding: 16px; margin-bottom: 24px;">
                    <p style="margin: 0; color: #fbbf24; font-weight: 500;">
                        ${escapeHtml(op.summary || 'Possible Issue Detected')}
                    </p>
                    <p style="margin: 8px 0 0 0; opacity: 0.8; line-height: 1.5;">
                        ${escapeHtml(desc)}
                    </p>
                    <p style="margin: 12px 0 0 0;">
                        ${sourceLinksHtml}
                    </p>
                </div>
                
                ${!state.disableSourceView && sourceInfos.length > 0 ? `
                <div class="section-title">Source Code</div>
                <div id="snippet-container"></div>
                ` : ''}
            </div>
        `;

        // Render snippet editors
        if (!state.disableSourceView && window.monaco && sourceInfos.length > 0) {
            const container = document.getElementById('snippet-container');
            for (let i = 0; i < sourceInfos.length; i++) {
                const src = sourceInfos[i];

                let code = null;
                if (src.file) {
                    try {
                        const res = await fetch(`${window.BASE_PATH}/_code?file=${encodeURIComponent(src.file)}`);
                        if (res.ok) code = await res.text();
                        else code = `// Failed to load source: ${res.statusText}`;
                    } catch (e) { code = `// Error loading source: ${e.message}`; }
                }

                if (code) {
                    const wrapper = document.createElement('div');
                    wrapper.id = `snippet-group-${i}`;
                    wrapper.classList.add('source-group');
                    wrapper.style.marginBottom = '16px';

                    wrapper.innerHTML = `
                    <div class="source-header-actions" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                        <a href="vscode://file/${src.file}:${src.line}" class="doc-source-link" title="${src.file}:${src.line}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px">
                                <polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>
                            </svg>
                            ${src.file.split('/').pop()}:${src.line}
                        </a>
                        <button class="btn-icon" title="Toggle Fullscreen" onclick="toggleFullscreen('snippet-group-${i}', 'snippet-editor-${i}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
                            </svg>
                        </button>
                    </div>
                    <div id="snippet-editor-${i}" style="height: 400px; border: 1px solid #333; border-radius: 6px; overflow: hidden;"></div>`;
                    container.appendChild(wrapper);

                    monaco.editor.colorize(code, 'typescript', {}).then(() => {
                        const el = document.getElementById(`snippet-editor-${i}`);
                        if (!el) return;

                        const model = monaco.editor.createModel(code, "typescript");
                        const editor = monaco.editor.create(el, {
                            model: model,
                            readOnly: true,
                            theme: 'vs-dark',
                            minimap: { enabled: true },
                            glyphMargin: true,
                            folding: false,
                            lineNumbers: 'on',
                            fontSize: 12,
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            backgroundColor: 'transparent'
                        });

                        // Apply highlighting
                        const decorations = [];

                        // Highlight the warning lines if specified
                        if (src.highlightLines) {
                            let startLine = src.highlightLines[0];
                            let endLine = src.highlightLines[1];

                            if (startLine > 0) {
                                decorations.push({
                                    range: new monaco.Range(startLine, 1, endLine, 1),
                                    options: {
                                        isWholeLine: true,
                                        className: 'warning-line-highlight',
                                        glyphMarginClassName: 'warning-glyph'
                                    }
                                });
                                editor.revealLineInCenter(startLine);
                            }
                        }

                        editor.deltaDecorations([], decorations);
                    });
                }
            }

        }
        return;
    }

    // Source Link for Doc Header
    const sourceInfos = Array.isArray(op['x-source-info']) ? op['x-source-info'] : (op['x-source-info'] ? [op['x-source-info']] : []);

    let sourceLinkHtml = '';
    if (!state.disableSourceView && sourceInfos.length > 0) {
        // Show only first one in header or a "View Sources" dropdown?
        // For simplicity, let's show the first one if length is 1, else "x Sources"
        if (sourceInfos.length === 1) {
            const s = sourceInfos[0];
            const filename = s.file.split('/').pop();
            sourceLinkHtml = `<a href="vscode://file/${s.file}:${s.line}" class="doc-source-link" title="${s.file}:${s.line}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px">
                    <polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                <code style="font-family: inherit;">${escapeHtml(filename)}:${s.line}</code>
            </a>`;
        } else {
            sourceLinkHtml = `<div class="doc-source-link" title="Multiple sources">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px">
                    <polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                ${sourceInfos.length} Locations
            </div>`;
        }
    }

    els.docPanel.innerHTML = `
        <div class="doc-header">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                    <h1 class="doc-title" style="margin:0">${escapeHtml(item.name)}</h1>
                    ${sourceLinkHtml}
            </div>
            <div class="doc-meta">
                <span class="badge badge-${item.type === 'publish' ? 'SEND' : 'RECV'}" style="font-size: 0.8rem; padding: 4px 8px;">${item.type === 'publish' ? 'SEND' : 'RECV'}</span>
                <span>${escapeHtml(op.operationId || '')}</span>
            </div>
        </div>
        <div class="doc-body">
            ${desc ? `<p style="line-height: 1.6; margin-bottom: 2rem;">${escapeHtml(desc)}</p>` : ''}
            
            <div class="section-title">Payload Schema</div>
            ${payload ? renderSchemaToDOM(payload) : '<div class="empty-state-text" style="color:var(--text-muted); font-style:italic;">Payload Unused</div>'}
            
            ${!state.disableSourceView && sourceInfos.length > 0 ? `
            <div class="section-title" style="margin-top: 24px;">Source Code</div>
            <div id="source-viewer-container"></div>
            ` : ''}
        </div>
    `;

    // Render Source Viewers
    if (!state.disableSourceView && sourceInfos.length > 0 && window.monaco) {
        const container = document.getElementById('source-viewer-container');
        container.innerHTML = '';

        // Group by file
        const grouped = {};
        sourceInfos.forEach(s => {
            if (!s.file) return;
            if (!grouped[s.file]) grouped[s.file] = [];
            grouped[s.file].push(s);
        });
        const files = Object.keys(grouped);

        // Render Tabs if multiple files
        if (files.length > 1) {
            const tabBar = document.createElement('div');
            tabBar.style.display = 'flex';
            tabBar.style.gap = '8px';
            tabBar.style.marginBottom = '12px';
            tabBar.style.borderBottom = '1px solid var(--border-color)';
            tabBar.style.paddingBottom = '8px';

            files.forEach((f, idx) => {
                const tab = document.createElement('button');
                tab.className = idx === 0 ? 'btn' : 'btn secondary';
                tab.style.padding = '4px 12px';
                tab.style.fontSize = '0.8rem';
                tab.innerText = f.split('/').pop();
                tab.onclick = () => {
                    // Toggle active state
                    Array.from(tabBar.children).forEach(b => b.className = 'btn secondary');
                    tab.className = 'btn';
                    // Toggle visibility
                    files.forEach((_, otherIdx) => {
                        const el = document.getElementById(`source-group-${otherIdx}`);
                        if (el) el.style.display = otherIdx === idx ? 'flex' : 'none';
                    });
                };
                tabBar.appendChild(tab);
            });
            container.appendChild(tabBar);
        }

        // Render Editors
        for (let i = 0; i < files.length; i++) {
            const fileName = files[i];
            const sources = grouped[fileName];

            const wrapper = document.createElement('div');
            wrapper.id = `source-group-${i}`;
            wrapper.classList.add('source-group');
            wrapper.style.display = i === 0 ? 'flex' : 'none';

            wrapper.innerHTML = `<div class="source-header-actions" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                        <a href="vscode://file/${fileName}:${sources[0].line}" class="doc-source-link" title="${fileName}:${sources[0].line}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px">
                                <polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>
                            </svg>
                            <code style="font-family: inherit;">${fileName.split('/').pop()}:${sources[0].line}</code>
                        </a>
                        <button class="btn-icon" title="Toggle Fullscreen" onclick="toggleFullscreen('source-group-${i}', 'source-editor-${i}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
                            </svg>
                        </button>
                    </div>
                    <div id="source-editor-${i}" style="height: 100%; border: 1px solid #333; border-radius: 6px; overflow: hidden;"></div>`;
            container.appendChild(wrapper);

            (async () => {
                let code = null;
                try {
                    const res = await fetch(`${window.BASE_PATH}/_code?file=${encodeURIComponent(fileName)}`);
                    if (res.ok) code = await res.text();
                    else code = `// Failed to load source: ${res.statusText}`;
                } catch (e) { code = `// Error loading source: ${e.message}`; }

                if (code) {
                    const el = document.getElementById(`source-editor-${i}`);
                    if (!el) return;
                    const model = monaco.editor.createModel(code, "typescript");
                    const editor = monaco.editor.create(el, {
                        model: model,
                        readOnly: true,
                        theme: 'vs-dark',
                        minimap: { enabled: true },
                        glyphMargin: false,
                        folding: false,
                        lineNumbers: 'on',
                        fontSize: 12,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        backgroundColor: 'transparent'
                    });

                    // Aggregate Highlights
                    const decorations = [];
                    let firstScrollLine = null;

                    sources.forEach(src => {
                        // Determine potential scroll target
                        const scrollLine = src.emitHighlightLines ? src.emitHighlightLines[0] : (src.highlightLines ? src.highlightLines[0] : 1);
                        if (!firstScrollLine && scrollLine > 1) {
                            firstScrollLine = scrollLine;
                        }

                        // Apply Context Highlight (if no emit highlight for this specific entry)
                        if (src.highlightLines && !src.emitHighlightLines) {
                            let startLine = src.highlightLines[0];
                            let endLine = src.highlightLines[1];
                            if (startLine > 0) {
                                decorations.push({
                                    range: new monaco.Range(startLine, 1, endLine, 1),
                                    options: {
                                        isWholeLine: true,
                                        className: 'closure-highlight'
                                    }
                                });
                            }
                        }

                        // Apply Emit Highlight
                        applyEmitHighlight(decorations, src);
                    });

                    // Scroll to the first relevant line found
                    if (firstScrollLine) {
                        editor.revealLineInCenter(firstScrollLine);
                    }

                    editor.deltaDecorations([], decorations);
                }
            })();
        }
    }

    // Scaffold Editor
    if (item.type === 'publish') {
        let scaffold = "{}";
        if (payload && payload.properties) {
            const obj = {};
            Object.keys(payload.properties).forEach(k => {
                obj[k] = payload.properties[k].example || (payload.properties[k].type === 'number' ? 0 : "");
            });
            scaffold = JSON.stringify(obj, null, 2);
        }
        if (state.editor) state.editor.setValue(scaffold);
    }
}

// Helper to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderSchemaToDOM(schema) {
    if (!schema || schema.type !== 'object') {
        return `<div class="code-block">${escapeHtml(JSON.stringify(schema, null, 2))}</div>`;
    }

    let html = '<div class="schema-root">';

    function renderProps(props, required = []) {
        let out = '';
        Object.keys(props).forEach(key => {
            const prop = props[key];
            const isReq = required.includes(key);
            const type = prop.type || 'any';
            const desc = prop.description || '';

            out += `
                    <div class="schema-row">
                        <div class="schema-prop">
                            ${escapeHtml(key)} ${isReq ? '<span class="prop-req">*</span>' : ''}
                        </div>
                        <div style="flex: 1;">
                            <div style="display:flex; align-items:baseline;">
                                <span class="schema-type">${escapeHtml(type)}</span>
                                <span class="schema-desc">${escapeHtml(desc)}</span>
                            </div>
                            ${prop.properties ? `<div class="nested-schema">${renderProps(prop.properties, prop.required)}</div>` : ''}
                        </div>
                    </div>`;
        });
        return out;
    }

    if (schema.properties) {
        html += renderProps(schema.properties, schema.required);
    }
    html += '</div>';
    return html;
}

/* ================= Console & Utils ================= */
const ROW_HEIGHT = 28;

function renderLogs() {
    const container = els.logs;
    const total = state.logEntries.length;
    els.logShim.style.height = (total * ROW_HEIGHT) + 'px';

    // Calculate visible range
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;

    const startNode = Math.floor(scrollTop / ROW_HEIGHT);
    // Buffer of 2 items
    const startIndex = Math.max(0, startNode - 2);
    const endIndex = Math.min(total, Math.ceil((scrollTop + clientHeight) / ROW_HEIGHT) + 2);

    // Remove existing entries
    // Note: We keep log-shim (which usually has ID)
    // We can select all .log-entry`
    const entries = container.getElementsByClassName('log-entry');
    while (entries.length > 0) {
        entries[0].remove();
    }

    for (let i = startIndex; i < endIndex; i++) {
        const entry = state.logEntries[i];
        if (!entry) continue;

        const div = document.createElement('div');
        div.className = 'log-entry ' + entry.type;
        div.style.top = (i * ROW_HEIGHT) + 'px';
        div.style.height = ROW_HEIGHT + 'px';
        div.style.overflow = 'hidden';
        div.style.whiteSpace = 'nowrap';
        div.style.textOverflow = 'ellipsis';
        div.style.display = 'flex';
        div.style.alignItems = 'center';

        const icons = {
            in: `<svg width="24px" height="24px" viewBox="0 0 24 24" fill="#7986cb"><path d="M17.707 6.293a1 1 0 0 1 0 1.414L9.414 16H15a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1V9a1 1 0 1 1 2 0v5.586l8.293-8.293a1 1 0 0 1 1.414 0z"/></svg>`,
            out: `<svg width="24px" height="24px" viewBox="0 0 24 24" fill="#4caf50"><path d="M8 7a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v8a1 1 0 1 1-2 0V9.414l-8.293 8.293a1 1 0 0 1-1.414-1.414L14.586 8H9a1 1 0 0 1-1-1z"/></svg>`,
            error: `<svg width="24px" height="24px" viewBox="0 0 24 24" fill="#ff5722"><path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12zm5.793-4.207a1 1 0 0 1 1.414 0L12 10.586l2.793-2.793a1 1 0 1 1 1.414 1.414L13.414 12l2.793 2.793a1 1 0 0 1-1.414 1.414L12 13.414l-2.793 2.793a1 1 0 0 1-1.414-1.414L10.586 12 7.793 9.207a1 1 0 0 1 0-1.414z"/></svg>`,
            info: `<svg width="24px" height="24px" viewBox="0 0 24 24" fill="#03a9f4"><path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12z"/><path d="M12 10a1 1 0 0 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1zm1.5-2.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/></svg>`
        };
        // Escape HTML in msg
        div.innerHTML = `<span>${icons[entry.type]}</span><span class="log-time">${entry.time}</span><span class="log-content"></span>`;

        const logContent = div.querySelector('.log-content');
        logContent.title = entry.msg;
        logContent.innerText = entry.msg;

        container.appendChild(div);
    }

    // Auto-scroll logic
    if (state.logAutoScroll && total > 0) {
        if (container.scrollTop + clientHeight < els.logShim.offsetHeight) {
            container.scrollTop = els.logShim.offsetHeight - clientHeight;
        }
    }
}

function log(source, msg, type = 'info') {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    state.logEntries.push({ source, msg, type, time });

    // If we are already near bottom, keep auto-scroll true
    const container = els.logs;
    const diff = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (diff < 50) state.logAutoScroll = true;

    renderLogs();
}

function updateStatus() {
    if (state.isConnected) {
        els.statusText.innerText = 'Connected';
        els.statusText.style.color = '#10b981';
        els.statusDot.className = 'dot connected';
        els.connectBtn.innerText = 'Disconnect';
        els.connectBtn.className = 'btn secondary';
    } else {
        els.statusText.innerText = 'Disconnected';
        els.statusText.style.color = '#666';
        els.statusDot.className = 'dot';
        els.connectBtn.innerText = 'Connect';
        els.connectBtn.className = 'btn';
    }
}

function connect() {
    const url = els.url.value;
    state.protocol = els.protocol.value;
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);

    const isWs = state.protocol === 'ws' || state.protocol === 'wss';
    const fullUrl = (isWs ? (url.startsWith('ws') ? url : state.protocol + '://' + url) : (url.startsWith('http') ? url : 'http://' + url));
    log('System', `Connecting to ${fullUrl}...`);

    if (isWs) {
        try {
            state.socket = new WebSocket(fullUrl);
            state.socket.onopen = () => {
                state.isConnected = true;
                updateStatus();
                log('System', 'Connected', 'in');
                // No need to loadSpec again here, handled by initial load
            };
            state.socket.onclose = () => {
                if (state.isConnected) log('System', 'Disconnected');
                state.isConnected = false;
                updateStatus();
                if (state.shouldAutoReconnect) scheduleReconnect();
            };
            state.socket.onerror = () => log('System', 'Connection Error', 'error');
            state.socket.onmessage = (e) => log('Server', e.data, 'in');
        } catch (e) { log('System', e.message, 'error'); }
    } else {
        state.socket = io(fullUrl, { transports: ['websocket'] });
        state.socket.on('connect', () => { state.isConnected = true; updateStatus(); log('System', `Connected (${state.socket.id})`, 'in'); });
        state.socket.on('disconnect', () => { state.isConnected = false; updateStatus(); log('System', 'Disconnected'); });
        state.socket.onAny((e, ...args) => log('Server', `${e}: ${JSON.stringify(args)}`, 'in'));
    }
}

function disconnect() {
    state.shouldAutoReconnect = false;
    if (state.socket) {
        (state.protocol === 'ws' || state.protocol === 'wss') ? state.socket.close() : state.socket.disconnect();
    }
}

function scheduleReconnect() {
    if (state.reconnectTimer) return;
    els.statusText.innerText = 'Reconnecting...';
    state.reconnectTimer = setTimeout(() => { state.reconnectTimer = null; connect(); }, 3000);
}

els.connectBtn.onclick = () => {
    if (state.isConnected) disconnect();
    else { state.shouldAutoReconnect = true; connect(); }
};

els.sendBtn.onclick = () => {
    if (!state.isConnected) return log('System', 'Not connected', 'error');
    if (!state.selectedEvent) return log('System', 'Select event', 'error');
    try {
        const body = JSON.parse(state.editor.getValue());
        const evt = state.selectedEvent.name;
        if (state.protocol === 'ws' || state.protocol === 'wss') {
            const pay = JSON.stringify({ type: 'EVENT', event: evt, data: body });
            state.socket.send(pay);
            log('Client', pay, 'out');
        } else {
            state.socket.emit(evt, body);
            log('Client', `${evt}: ${JSON.stringify(body)}`, 'out');
        }
    } catch (e) { log('System', 'Invalid JSON', 'error'); }
};

/* ================= Fullscreen Toggle ================= */
window.toggleFullscreen = function (containerId, editorId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const isFullscreen = container.classList.toggle('fullscreen');

    // Find the button to update icon
    // The button is inside .source-header-actions
    const btn = container.querySelector('button[title="Toggle Fullscreen"]') || container.querySelector('button[title="Exit Fullscreen"]');

    if (btn) {
        if (isFullscreen) {
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>`;
            btn.title = "Exit Fullscreen";
        } else {
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path></svg>`;
            btn.title = "Toggle Fullscreen";
        }
    }

    // ESC to exit
    if (isFullscreen) {
        const onEsc = (e) => {
            if (e.key === 'Escape') {
                window.toggleFullscreen(containerId, editorId);
            }
        };
        container._escHandler = onEsc;
        document.addEventListener('keydown', onEsc);
    } else {
        if (container._escHandler) {
            document.removeEventListener('keydown', container._escHandler);
            delete container._escHandler;
        }
    }
};
