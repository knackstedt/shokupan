
// ============================================================================
// REPLAY MODAL LOGIC
// ============================================================================

window.openReplayModal = function (request) {
    injectReplayStyles();

    // Initialize State
    window.currentReplayState = {
        method: request.method || 'GET',
        url: request.url || '',
        headers: Object.entries(request.requestHeaders || {}).map(([k, v]) => ({ key: k, value: v })),
        body: typeof (request.requestBody) === 'string' ? request.requestBody : (request.requestBody ? JSON.stringify(request.requestBody || {}, null, 2) : ''),
        direction: request.direction || 'outbound',
        activeTab: 'body',
        response: null
    };

    renderReplayModal();
};

// Handler for the replay button in timeline
window.handleReplay = function (request, message) {
    console.log("Replay requested for message:", message);
    if (window.openReplayModal) {
        // Construct a pseudo-request for replay
        const replayReq = {
            method: 'POST', // Default for WS message replay?
            url: request.url,
            requestHeaders: {},
            requestBody: message.data,
            direction: message.dir === 'out' ? 'outbound' : 'inbound' // If replaying OUT, we send OUT.
        };
        window.openReplayModal(replayReq);
    } else {
        alert(`Replay for message at +${Math.round(message.offset)}ms requested.`);
    }
};

window.closeReplayModal = function () {
    const el = document.getElementById('replay-modal-overlay');
    if (el) el.remove();
};

function injectReplayStyles() {
    if (document.getElementById('replay-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'replay-modal-styles';
    style.textContent = `
        #replay-modal-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(2px);
        }
        #replay-modal {
            background: var(--bg-secondary); width: 800px; max-width: 95vw; height: 80vh;
            border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            display: flex; flex-direction: column; border: 1px solid var(--border-color);
        }
        .replay-header {
            padding: 1rem; border-bottom: 1px solid var(--border-color);
            display: flex; justify-content: space-between; align-items: center;
            font-weight: 600; font-size: 1.1rem;
        }
        .replay-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .replay-toolbar {
            padding: 1rem; display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border-color);
            background: var(--bg-primary);
        }
        .replay-input {
            flex: 1; padding: 0.5rem; border-radius: 4px; border: 1px solid var(--border-color);
            background: var(--bg-secondary); color: var(--text-primary);
        }
        .replay-method {
            padding: 0.5rem; border-radius: 4px; border: 1px solid var(--border-color);
            background: var(--bg-secondary); color: var(--text-primary); font-weight: bold;
        }
        .replay-btn {
            padding: 0.5rem 1rem; border-radius: 4px; border: none; cursor: pointer;
            font-weight: 500; display: flex; align-items: center; gap: 0.5rem;
        }
        .btn-primary { background: var(--primary-color, #3b82f6); color: white; }
        .btn-secondary { background: var(--bg-primary, #e5e7eb); color: var(--text-primary); }
        .dark .btn-secondary { background: #374151; }
        
        .replay-tabs { display: flex; border-bottom: 1px solid var(--border-color); background: var(--bg-primary); }
        .replay-tab {
            padding: 0.75rem 1rem; cursor: pointer; border-bottom: 2px solid transparent;
            color: var(--text-secondary);
        }
        .replay-tab.active {
            border-color: var(--primary-color, #3b82f6); color: var(--text-primary);
        }
        
        .replay-content { flex: 1; overflow-y: auto; padding: 1rem; position: relative; }
        .code-editor {
            width: 100%; height: 100%; font-family: monospace; border: none; resize: none;
            background: transparent; color: var(--text-primary); outline: none;
        }
        
        .kv-editor-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
        .kv-key, .kv-val { flex: 1; padding: 0.4rem; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; }
        .kv-remove { padding: 0.4rem; cursor: pointer; color: #ef4444; }
        
        .response-status-badge {
            padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem; font-weight: bold;
        }
        .status-2xx { background: rgba(16, 185, 129, 0.2); color: #10b981; }
        .status-4xx { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
        .status-5xx { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    `;
    document.head.appendChild(style);
}

window.updateReplayState = function (key, value) {
    if (!window.currentReplayState) return;
    window.currentReplayState[key] = value;
    if (key === 'activeTab') renderReplayModal();
};

window.updateReplayHeader = function (index, field, value) {
    window.currentReplayState.headers[index][field] = value;
};

window.addReplayHeader = function () {
    window.currentReplayState.headers.push({ key: '', value: '' });
    renderReplayModal();
};

window.removeReplayHeader = function (index) {
    window.currentReplayState.headers.splice(index, 1);
    renderReplayModal();
};

window.executeReplay = function () {
    const { method, url, headers, body, direction } = window.currentReplayState;

    const headersObj = {};
    headers.forEach(h => {
        if (h.key) headersObj[h.key] = h.value;
    });

    let bodyData = body;
    try {
        bodyData = JSON.parse(body);
    } catch (e) {
    }

    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname.slice(0, -1) : window.location.pathname;

    const btn = document.querySelector('.replay-toolbar .btn-primary');
    if (btn) btn.innerText = 'Sending...';

    console.log('[Dashboard] Replaying request:', { method, url, direction });

    fetch(basePath + '/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            method,
            url,
            headers: headersObj,
            body: bodyData,
            direction: direction || 'outbound'
        })
    })
        .then(res => res.json())
        .then(result => {
            console.log('[Dashboard] Replay result:', result);
            if (result.error) {
                alert("Error: " + result.error);
            } else {
                let bodyStr = result.data;
                if (typeof bodyStr === 'object') bodyStr = JSON.stringify(bodyStr, null, 2);

                window.currentReplayState.response = {
                    status: result.status,
                    headers: result.headers,
                    body: result.data,
                    duration: result.duration,
                    size: bodyStr ? bodyStr.length : 0
                };
                window.currentReplayState.responseBodyStr = bodyStr;
                window.currentReplayState.activeTab = 'response';
                renderReplayModal();
            }
        })
        .catch(err => {
            console.error('[Dashboard] Replay failed:', err);
            alert("Replay failed: " + err);
        })
        .finally(() => {
            if (btn) btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Send`;
        });
};

function renderReplayModal() {
    let el = document.getElementById('replay-modal-overlay');
    if (!el) return; // Should exist if called safely

    const { method, url, headers, body, activeTab, response } = window.currentReplayState;

    // Safety check for escapeHtml if not extracted yet (assuming it's in requests.js or global)
    // We should probably rely on requests.js loading first or define duplicate.
    // Let's assume escapeHtml is global (it was used in requests.js but defined locally? No, I need to check requests.js)
    // Checking requests.js... escapeHtml wasn't visible in snippets. Assuming it's there or I need to add it.
    // Safe replacement:
    const safeHtml = (str) => {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    el.innerHTML = `
        <div id="replay-modal">
            <div class="replay-header">
                <span>Replay Request</span>
                <div style="display:flex; gap: 0.5rem">
                    <button class="replay-btn btn-secondary" onclick="document.getElementById('replay-import-file').click()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Import
                    </button>
                    <input type="file" id="replay-import-file" style="display:none" onchange="handleReplayImport(this)">
                    <button class="replay-btn btn-secondary" onclick="window.copyReplayCurl()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        Copy Curl
                    </button>
                    <button class="replay-btn" style="background: transparent; color: var(--text-secondary)" onclick="closeReplayModal()">✕</button>
                </div>
            </div>
            
            <div class="replay-toolbar">
                <select class="replay-method" onchange="updateReplayState('method', this.value)">
                    <option value="GET" ${method === 'GET' ? 'selected' : ''}>GET</option>
                    <option value="POST" ${method === 'POST' ? 'selected' : ''}>POST</option>
                    <option value="PUT" ${method === 'PUT' ? 'selected' : ''}>PUT</option>
                    <option value="DELETE" ${method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                    <option value="PATCH" ${method === 'PATCH' ? 'selected' : ''}>PATCH</option>
                </select>
                <input class="replay-input" value="${safeHtml(url)}" oninput="updateReplayState('url', this.value)" placeholder="https://api.example.com/v1/...">
                <button class="replay-btn btn-primary" onclick="executeReplay()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Send
                </button>
            </div>
            
            <div class="replay-tabs">
                <div class="replay-tab ${activeTab === 'body' ? 'active' : ''}" onclick="updateReplayState('activeTab', 'body')">Body</div>
                <div class="replay-tab ${activeTab === 'headers' ? 'active' : ''}" onclick="updateReplayState('activeTab', 'headers')">Headers</div>
                <div class="replay-tab ${activeTab === 'response' ? 'active' : ''}" onclick="updateReplayState('activeTab', 'response')">
                    Response ${response ? `<span style="font-size: 0.8em; opacity: 0.8">(${response.status})</span>` : ''}
                </div>
            </div>
            
            <div class="replay-content">
                ${activeTab === 'body' ? `
                    <textarea class="code-editor" spellcheck="false" oninput="updateReplayState('body', this.value)">${safeHtml(body)}</textarea>
                ` : ''}
                
                ${activeTab === 'headers' ? `
                    <div id="replay-headers-list">
                        ${headers.map((h, i) => `
                            <div class="kv-editor-row">
                                <input class="kv-key" value="${safeHtml(h.key)}" oninput="updateReplayHeader(${i}, 'key', this.value)" placeholder="Key">
                                <input class="kv-val" value="${safeHtml(h.value)}" oninput="updateReplayHeader(${i}, 'value', this.value)" placeholder="Value">
                                <div class="kv-remove" onclick="removeReplayHeader(${i})">✕</div>
                            </div>
                        `).join('')}
                    </div>
                    <button class="replay-btn btn-secondary" style="margin-top: 1rem" onclick="addReplayHeader()">+ Add Header</button>
                ` : ''}
                
                ${activeTab === 'response' ? renderReplayResponsePlaceholder(response) : ''}
            </div>
        </div>
    `;

    if (activeTab === 'response' && response) {
        setTimeout(() => {
            const el = document.getElementById('replay-response-editor');
            if (el && window.renderMonacoEditor) { // Ensure renderer available
                let content = response.body || '';
                if (typeof content === 'object') content = JSON.stringify(content, null, 2);

                let lang = 'json';
                if (typeof content === 'string' && !content.trim().startsWith('{') && !content.trim().startsWith('[')) {
                    lang = 'plaintext';
                }
                window.renderMonacoEditor(el, content, lang, true);
            }
        }, 0);
    }
}

function renderReplayResponsePlaceholder(response) {
    if (!response) return `<div style="color: var(--text-secondary); text-align: center; margin-top: 2rem;">No response yet. Click Send to replay.</div>`;

    // formatBytes depends on requests.js? 
    const fmtBytes = window.formatBytes || (b => b + ' B');
    let colorClass = response.status >= 500 ? 'status-5xx' : response.status >= 400 ? 'status-4xx' : 'status-2xx';

    return `
        <div style="margin-bottom: 1rem; display: flex; gap: 1rem; align-items: center;">
            <span class="response-status-badge ${colorClass}">${response.status} ${response.statusText || ''}</span>
            <span style="color: var(--text-secondary)">${fmtBytes(response.size || 0)}</span>
            <span style="color: var(--text-secondary)">${response.duration || 0}ms</span>
            <div style="flex:1"></div>
            <button class="replay-btn btn-secondary" onclick="window.copyToClipboard(window.currentReplayState.responseBodyStr)">Copy</button>
        </div>
        <div style="border: 1px solid var(--border-color); border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; height: calc(100% - 40px)">
             <div id="replay-response-editor" style="flex: 1;"></div>
        </div>
    `;
}

window.copyReplayCurl = function () {
    const { method, url, headers, body } = window.currentReplayState;
    let cmd = `curl -X ${method} "${url}"`;
    headers.forEach(h => {
        if (h.key) cmd += ` \\\n  -H "${h.key}: ${h.value}"`;
    });
    if (body) {
        const escaped = body.replace(/"/g, '\\"');
        cmd += ` \\\n  -d "${escaped}"`;
    }
    if (window.copyToClipboard) window.copyToClipboard(cmd);
};

window.handleReplayImport = function (input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            // HAR Logic reused
            if (data.log && data.log.entries) {
                const entry = data.log.entries[0];
                if (entry && entry.request) {
                    window.currentReplayState.method = entry.request.method;
                    window.currentReplayState.url = entry.request.url;
                    window.currentReplayState.headers = entry.request.headers.map(h => ({ key: h.name, value: h.value }));
                    if (entry.request.postData && entry.request.postData.text) {
                        window.currentReplayState.body = entry.request.postData.text;
                    }
                }
            } else {
                window.currentReplayState.method = data.method || 'GET';
                window.currentReplayState.url = data.url || '';
                if (data.headers) {
                    if (Array.isArray(data.headers)) window.currentReplayState.headers = data.headers;
                    else window.currentReplayState.headers = Object.entries(data.headers).map(([k, v]) => ({ key: k, value: v }));
                }
                if (data.body) {
                    window.currentReplayState.body = typeof data.body === 'string' ? data.body : JSON.stringify(data.body, null, 2);
                }
            }
            renderReplayModal();
        } catch (err) {
            alert("Failed to parse file: " + err.message);
        }
    };
    reader.readAsText(file);
    input.value = '';
};
