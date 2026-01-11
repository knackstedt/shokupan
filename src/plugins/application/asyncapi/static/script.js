const state = {
    socket: null,
    isConnected: false,
    shouldAutoReconnect: true,
    reconnectTimer: null,
    protocol: 'ws',
    spec: null,
    editor: null,
    selectedEvent: null,
    logEntries: [],
    logAutoScroll: true
};

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
    targetEventLabel: document.getElementById('target-event')
};

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
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    };
    setup('resizer-left', '--sidebar-width', true);
    setup('resizer-right', '--console-width', false);
}

// Initialize Monaco
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
    initResizers(); // Init resizers

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
        padding: { top: 10, bottom: 10 },
        fontSize: 12,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        backgroundColor: 'transparent'
    });
    connect();
});

async function loadSpec() {
    try {
        const res = await fetch('<%~ it.specPath %>');
        state.spec = await res.json();
        renderNav();
    } catch (e) {
        log('System', 'Failed to load spec: ' + e.message, 'error');
    }
}

/* ================= Navigation Tree Rendering ================= */
function renderNav() {
    if (!state.spec || !state.spec.channels) return;
    els.navList.innerHTML = '';

    const root = { children: {} };

    // Build Tree: Group by Tag -> split by . or /
    Object.keys(state.spec.channels).forEach(name => {
        const ch = state.spec.channels[name];
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

    // Recursive Render
    function createNode(node, container, level = 0) {
        Object.entries(node.children)
            .sort((a, b) => {
                const aKey = a[0];
                const bKey = b[0];
                const aItem = a[1];
                const bItem = b[1];

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

                if (aKey[0] === '/') return 1;
                if (bKey[0] === '/') return -1;

                return aKey.localeCompare(bKey);
            })
            .forEach(([key, item]) => {
                const hasChildren = Object.keys(item.children).length > 0;

                if (level === 0) {
                    // Top Level Group (Tag)
                    const el = document.createElement('div');
                    el.className = 'group-label';
                    el.innerText = key;
                    container.appendChild(el);

                    if (hasChildren) {
                        const childContainer = document.createElement('div');
                        childContainer.className = 'tree-node';
                        childContainer.style.marginLeft = '0';
                        createNode(item, childContainer, level + 1);
                        container.appendChild(childContainer);
                    }
                } else {
                    // Nested Nodes
                    if (item.isLeaf) {
                        // Render as Event (even if it has children)
                        const el = document.createElement('div');
                        el.className = 'tree-item';

                        let labelHtml = '';
                        if (item.data.op['x-warning']) {
                            // Warning Node
                            el.style.color = '#fbbf24'; // amber-400
                            labelHtml = `<span style="margin-right: 6px;">⚠️</span> <span class="tree-label">${key}</span>`;
                        } else {
                            // Standard Event Node
                            const badgeType = item.data.type === 'publish' ? 'send' : 'recv';
                            const badgeText = item.data.type === 'publish' ? 'SEND' : 'RECV';
                            labelHtml = `<span class="badge ${badgeType}">${badgeText}</span> <span class="tree-label">${key}</span>`;
                        }

                        // Source Link
                        const src = item.data.op['x-source-info'];
                        if (src) {
                            const link = `vscode://file/${src.file}:${src.line}`;
                            // Code icon
                            labelHtml += `<a href="${link}" class="source-link" onclick="event.stopPropagation()" title="${src.file}:${src.line}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:block">
                                <polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>
                                </svg>
                             </a>`;
                        }
                        el.innerHTML = labelHtml;

                        el.onclick = () => selectEvent(item.data, el);
                        container.appendChild(el);
                    } else {
                        // Render as Folder Label (only if NOT a leaf)
                        const folderLabel = document.createElement('div');
                        folderLabel.className = 'tree-item';
                        folderLabel.style.color = 'var(--text-muted)';
                        folderLabel.innerHTML = `<span class="tree-label">${key}</span>`;
                        container.appendChild(folderLabel);
                    }

                    // If it has children, render them in a container
                    if (hasChildren) {
                        const childContainer = document.createElement('div');
                        childContainer.className = 'tree-node';
                        createNode(item, childContainer, level + 1);
                        container.appendChild(childContainer);
                    }
                }
            });
    }

    createNode(root, els.navList);
}

/* ================= Schema & Doc Rendering ================= */
function selectEvent(item, el) {
    document.querySelectorAll('.tree-item').forEach(n => n.classList.remove('active'));
    if (el) el.classList.add('active');

    state.selectedEvent = item;
    els.targetEventLabel.innerText = item.name;

    const op = item.op;
    const isWarning = !!op['x-warning'];
    const desc = op.description || op.summary || 'No description provided.';
    const payload = op.message?.payload || {};

    if (isWarning) {
        const sourceInfo = op['x-source-info'] || {};
        const fileLink = `vscode://file/${sourceInfo.file}:${sourceInfo.line}`;

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
                        ${op.summary || 'Possible Issue Detected'}
                    </p>
                    <p style="margin: 8px 0 0 0; opacity: 0.8; line-height: 1.5;">
                        ${desc}
                    </p>
                    <p style="margin: 12px 0 0 0;">
                        <a href="${fileLink}" style="color: #fbbf24; text-decoration: underline; font-family: monospace;">
                            ${sourceInfo.file}:${sourceInfo.line}
                        </a>
                    </p>
                </div>
                
                ${sourceInfo.snippet ? `
                <div class="section-title">Source Context</div>
                <div id="snippet-editor" style="height: 300px; border: 1px solid #333; border-radius: 6px; overflow: hidden;"></div>
                ` : ''}
            </div>
        `;

        // Render snippet editor if available
        if (sourceInfo.snippet && window.monaco) {
            monaco.editor.colorize(sourceInfo.snippet, 'typescript', {}).then(() => {
                const el = document.getElementById('snippet-editor');
                const model = monaco.editor.createModel(sourceInfo.snippet, "typescript");

                const scrollbarWidth = 14;
                const borderWidth = 6;
                const lineHeight = 17;
                el.style.height = (sourceInfo.snippet.match(/\n/g)?.length * lineHeight + borderWidth + scrollbarWidth) + 'px';
                const editor = monaco.editor.create(el, {
                    model: model,
                    readOnly: true,
                    theme: 'vs-dark',
                    minimap: { enabled: false },
                    lineNumbers: (num) => String((sourceInfo.offset || 1) + num - 1),
                    fontSize: 12,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    backgroundColor: 'transparent'
                });

                // Apply highlighting decoration if lines provided
                if (sourceInfo.highlightLines && sourceInfo.offset) {
                    const startLine = sourceInfo.highlightLines[0] - sourceInfo.offset + 1;
                    const endLine = sourceInfo.highlightLines[1] - sourceInfo.offset + 1;

                    if (startLine > 0) {
                        editor.deltaDecorations([], [
                            {
                                range: new monaco.Range(startLine, 1, endLine, 1),
                                options: {
                                    isWholeLine: true,
                                    className: 'warning-line-highlight',
                                    glyphMarginClassName: 'warning-glyph'
                                }
                            }
                        ]);
                        editor.revealLineInCenter(startLine);
                    }
                }
            });
        }
        return;
    }

    // Source Link for Doc Header
    const sourceInfo = op['x-source-info'];
    let sourceLink = '';
    if (sourceInfo) {
        const filename = sourceInfo.file.split('/').pop();
        sourceLink = `<a href="vscode://file/${sourceInfo.file}:${sourceInfo.line}" class="doc-source-link" title="${sourceInfo.file}:${sourceInfo.line}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px">
                <polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            ${filename}:${sourceInfo.line}
        </a>`;
    }

    els.docPanel.innerHTML = `
                <div class="doc-header">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                         <h1 class="doc-title" style="margin:0">${item.name}</h1>
                         ${sourceLink}
                    </div>
                    <div class="doc-meta">
                        <span class="badge ${item.type === 'publish' ? 'send' : 'recv'}" style="font-size: 0.8rem; padding: 4px 8px;">${item.type === 'publish' ? 'SEND' : 'RECV'}</span>
                        <span>${op.operationId || ''}</span>
                    </div>
                </div>
                <div class="doc-body">
                    <p style="line-height: 1.6; margin-bottom: 2rem;">${desc}</p>
                    <div class="section-title">Payload Schema</div>
                    ${renderSchemaToDOM(payload)}
                </div>
            `;

    // Scaffold Editor
    if (item.type === 'publish') {
        let scaffold = "{}";
        if (payload.properties) {
            const obj = {};
            Object.keys(payload.properties).forEach(k => {
                obj[k] = payload.properties[k].example || (payload.properties[k].type === 'number' ? 0 : "");
            });
            scaffold = JSON.stringify(obj, null, 2);
        }
        if (state.editor) state.editor.setValue(scaffold);
    }
}

function renderSchemaToDOM(schema) {
    if (!schema || schema.type !== 'object') {
        return `<div class="code-block">${JSON.stringify(schema, null, 2)}</div>`;
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
                            ${key} ${isReq ? '<span class="prop-req">*</span>' : ''}
                        </div>
                        <div style="flex: 1;">
                            <div style="display:flex; align-items:baseline;">
                                <span class="schema-type">${type}</span>
                                <span class="schema-desc">${desc}</span>
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

        // Escape HTML in msg
        const safeMsg = entry.msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        div.innerHTML = `<span class="log-time">${entry.time}</span><span class="log-content" title="${safeMsg}">${safeMsg}</span>`;
        container.appendChild(div);
    }

    // Auto-scroll logic
    if (state.logAutoScroll && total > 0) {
        // If we are auto-scrolling, we want to be at the bottom
        // But renderLogs is called ON scroll too. 
        // If called from `log()`, we might need to update scrollTop.
        // We set scrollTop to MAX.
        // But we only want to do this if we were already at bottom OR just added.
        // The event listener handles state.logAutoScroll flag.
        // If flag is true, force scroll.
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
                loadSpec();
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