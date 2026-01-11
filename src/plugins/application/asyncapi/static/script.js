const state = {
    socket: null,
    isConnected: false,
    shouldAutoReconnect: true,
    reconnectTimer: null,
    protocol: 'ws',
    spec: null,
    editor: null,
    selectedEvent: null
};

const els = {
    url: document.getElementById('url'),
    protocol: document.getElementById('protocol'),
    connectBtn: document.getElementById('connect-btn'),
    statusText: document.getElementById('connection-status'),
    statusDot: document.getElementById('status-dot'),
    logs: document.getElementById('logs'),
    sendBtn: document.getElementById('send-btn'),
    navList: document.getElementById('nav-list'),
    docPanel: document.getElementById('doc-panel'),
    targetEventLabel: document.getElementById('target-event')
};

// Initialize Monaco
require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
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
                if (aKey === bKey) return 0;
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
                        const badgeType = item.data.type === 'publish' ? 'send' : 'recv';
                        const badgeText = item.data.type === 'publish' ? 'SEND' : 'RECV';

                        el.innerHTML = `<span class="badge ${badgeType}">${badgeText}</span> <span class="tree-label">${key}</span>`;
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
    const desc = op.description || op.summary || 'No description provided.';
    const payload = op.message?.payload || {};

    els.docPanel.innerHTML = `
                <div class="doc-header">
                    <h1 class="doc-title">${item.name}</h1>
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
function log(source, msg, type = 'info') {
    const div = document.createElement('div');
    div.className = 'log-entry ' + type;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    div.innerHTML = `<span class="log-time">${time}</span><span class="log-content"></span>`;
    const content = div.querySelector('.log-content');
    content.innerText = msg;
    content.scrollIntoView({ behavior: 'smooth' });
    els.logs.append(div);
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