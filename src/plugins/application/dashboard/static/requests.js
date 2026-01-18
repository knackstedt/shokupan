
// Initialize Requests Table
window.requestsTable = null;

// Filter State
// Initialize Filter State
let filterText = '';
let filterType = 'all';
let filterDirection = 'all';

function initRequests() {
    console.log('[requests.js] Initializing...');

    // Initialize Filter Listeners
    const txtFilter = document.getElementById('network-filter-text');
    const typeFilter = document.getElementById('network-filter-type');
    const directionButtons = document.querySelectorAll('.filter-direction');

    if (directionButtons) {
        directionButtons.forEach(btn => {
            btn.onclick = () => {
                // Update active state
                directionButtons.forEach(b => {
                    b.style.background = 'transparent';
                    b.style.color = 'var(--text-secondary)';
                    b.classList.remove('active');
                });
                btn.style.background = 'var(--bg-primary)';
                btn.style.color = 'var(--text-primary)';
                btn.classList.add('active');

                filterDirection = btn.dataset.value;
                if (window.requestsTable) window.requestsTable.setFilter(customFilter);
            };
        });
    }

    if (txtFilter) {
        txtFilter.addEventListener('keyup', (e) => {
            filterText = e.target.value.toLowerCase();
            window.requestsTable.setFilter(customFilter);
        });
    }

    if (typeFilter) {
        typeFilter.addEventListener('change', (e) => {
            filterType = e.target.value;
            window.requestsTable.setFilter(customFilter);
        });
    }

    // specific check for Tabulator
    if (typeof Tabulator === 'undefined') {
        console.error('Tabulator is not defined. Ensure it is loaded before requests.js');
        return;
    }

    window.requestsTable = new Tabulator("#requests-list-container", {
        layout: "fitColumns",
        placeholder: "No requests found",
        selectable: 1,
        resizableColumnFit: true,
        height: "100%", // Fill container
        index: "id",
        rowHeight: 32, // Dense rows
        initialSort: [
            { column: "timestamp", dir: "desc" }
        ],
        columns: [
            {
                title: "Status",
                field: "status",
                width: 80,
                formatter: function (cell) {
                    const status = cell.getValue();
                    if (!status) return '<span style="color: var(--text-secondary)">Pending</span>';
                    const color = status >= 500 ? '#ef4444' : status >= 400 ? '#f59e0b' : '#10b981';
                    return `<span style="display: inline-block; width: 10px; height: 10px; background: ${color}; border-radius: 50%; margin-right: 6px;"></span>${status}`;
                }
            },
            {
                title: "Method",
                field: "method",
                width: 80,
                visible: true
            },
            {
                title: "Name",
                field: "url",
                widthGrow: 2, // Take up more space
                formatter: function (cell) {
                    const url = cell.getValue();
                    // Extract name from URL
                    let name = url;
                    try {
                        const u = new URL(url, 'http://localhost');
                        name = u.pathname;
                        if (name === '/') name = 'localhost';
                        const parts = name.split('/');
                        const last = parts[parts.length - 1];
                        if (last) name = last;
                    } catch (e) { }

                    return `<div style="display: flex; flex-direction: column; line-height: 1.2;">
                        <span style="color: var(--text-secondary);">${name}</span>
                    </div>`;
                }
            },
            {
                title: "Domain",
                field: "domain",
                width: 80,
                visible: true
            },
            {
                title: "Path",
                field: "path",
                width: 80,
                visible: true
            },
            {
                title: "URL",
                field: "url",
                width: 80,
                visible: true
            },
            {
                title: "Protocol",
                field: "protocol",
                width: 80,
                visible: true
            },
            {
                title: "Scheme",
                field: "scheme",
                width: 80,
                visible: true
            },
            {
                title: "Remote IP",
                field: "remoteIP",
                width: 80,
                visible: true
            },
            {
                title: "Initiator",
                field: "direction",
                width: 80,
                formatter: (cell) => {
                    const dir = cell.getValue();
                    return dir === 'outbound' ? 'Server' : 'Client';
                }
            },
            {
                title: "Type",
                field: "type",
                width: 80,
                formatter: (cell) => {
                    const r = cell.getData();
                    if (r.type === 'fetch') return 'fetch';
                    if (r.type === 'xhr') return 'xhr';
                    if (r.type === 'ws') return 'ws';
                    return r.contentType || 'document';
                }
            },
            {
                title: "Cookies",
                field: "cookies",
                width: 80,
                visible: true
            },
            {
                title: "Transferred",
                field: "transferred",
                width: 80,
                visible: true
            },
            {
                title: "Size",
                field: "size",
                width: 80,
                formatter: (cell) => formatBytes(cell.getValue())
            },
            {
                title: "Time",
                field: "duration",
                width: 80,
                formatter: (cell) => cell.getValue() ? Math.round(cell.getValue()) + ' ms' : 'Pending'
            },
            {
                title: "Waterfall",
                field: "timestamp",
                widthGrow: 1,
                formatter: waterfallFormatter,
                headerSort: false
            }
        ],
        data: []
    });

    // Row selection handler
    window.requestsTable.on("rowClick", function (e, row) {
        showRequestDetails(row.getData());
    });

    // Auto-fetch on load if tab is active (or just fetch initially)
    fetchRequests();
}

// Robust initialization
let initAttempts = 0;
function tryInit() {
    if (document.getElementById('requests-list-container') && typeof Tabulator !== 'undefined') {
        try {
            initRequests();
        } catch (e) {
            console.error('Failed to initialize requests table:', e);
            const el = document.getElementById('requests-list-container');
            if (el) el.innerHTML = `<div style="padding: 2rem; color: #ef4444;">Failed to initialize: ${e.message}</div>`;
        }
    } else {
        initAttempts++;
        if (initAttempts > 50) { // 5 seconds timeout
            console.error('Request table initialization timed out. Tabulator is:', typeof Tabulator);
            const el = document.getElementById('requests-list-container');
            if (el) el.innerHTML = `<div style="padding: 2rem; color: #ef4444;">
                Failed to load dependencies. <br>
                Tabulator: ${typeof Tabulator}
            </div>`;
            return;
        }
        setTimeout(tryInit, 100);
    }
}

tryInit();


function customFilter(data) {
    // Type Filter
    if (filterType !== 'all') {
        const type = data.type || 'xhr'; // default to xhr if missing
        if (filterType === 'fetch' && type !== 'fetch') return false;
        if (filterType === 'xhr' && type !== 'xhr') return false;
        if (filterType === 'ws' && type !== 'ws') return false;
    }

    // Direction Filter
    if (filterDirection !== 'all') {
        const dir = data.direction || 'inbound';
        if (filterDirection !== dir) return false;
    }

    // Text Filter (Regex-ish)
    if (filterText) {
        const text = (data.url + ' ' + data.method).toLowerCase();
        return text.includes(filterText);
    }

    return true;
}

function waterfallFormatter(cell) {
    const data = cell.getData();
    // We need a reference start time for the waterfall.
    // For now, let's use the oldest timestamp in the current page/view or relative to 10 seconds ago?
    // A better approach for "live" view is to just show bar width proportional to duration? 
    // Or relative to the start of the trace session. 

    // Simpler: Show duration bar relative to a fixed max (e.g. 1s or 5s).
    // Or just a simple bar representing execution time.

    // Let's do a "Time/Duration" visual.
    const duration = data.duration || 0;
    const maxDuration = 2000; // 2s baseline for full width
    const pct = Math.min(100, (duration / maxDuration) * 100);

    // Color based on duration
    const color = duration > 1000 ? '#ef4444' : duration > 500 ? '#f59e0b' : '#3b82f6';

    return `<div style="width: 100%; height: 100%; display: flex; align-items: center;">
        <div style="height: 6px; width: ${pct}%; background: ${color}; border-radius: 3px; min-width: 2px;"></div>
    </div>`;
}



function fetchRequests() {
    const headers = typeof getRequestHeaders !== 'undefined' ? getRequestHeaders() : {};
    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname.slice(0, -1) : window.location.pathname;
    const url = basePath + '/requests';

    fetch(url, { headers })
        .then(res => res.json())
        .then(data => {
            if (window.requestsTable) {
                window.requestsTable.setData(data.requests || []);
                window.requestsTable.setFilter(customFilter);
            }
        })
        .catch(err => {
            console.error("Failed to fetch requests", err);
        });
}



function showRequestDetails(request) {
    const container = document.getElementById('request-details-container');
    const content = document.getElementById('request-details-content');

    container.style.display = 'block';
    if (window.requestsTable) window.requestsTable.redraw();

    // Tab Headers
    const tabs = [
        { id: 'headers', label: 'Headers' },
        { id: 'cookies', label: 'Cookies' },
        { id: 'request', label: 'Request' },
        { id: 'response', label: 'Response' },
        { id: 'timings', label: 'Timings' },
        // { id: 'security', label: 'Security' } // Enable if we have data
    ];

    if (request.scheme === 'https' || request.scheme === 'wss') {
        tabs.push({ id: 'security', label: 'Security' });
    }

    let activeTab = 'headers';

    function renderTabs() {
        return `
            <div class="tabs-header" style="display: flex; border-bottom: 1px solid var(--border-color); margin-bottom: 1rem;">
                ${tabs.map(tab => `
                    <div class="tab-item ${tab.id === activeTab ? 'active' : ''}" 
                         data-tab="${tab.id}"
                         style="padding: 8px 16px; cursor: pointer; border-bottom: 2px solid ${tab.id === activeTab ? 'var(--primary-color, #3b82f6)' : 'transparent'}; color: ${tab.id === activeTab ? 'var(--text-primary)' : 'var(--text-secondary)'};">
                        ${tab.label}
                    </div>
                `).join('')}
            </div>
            <div id="tab-content" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column;">
                ${renderTabContent(activeTab, request)}
            </div>
        `;
    }

    content.innerHTML = renderTabs();

    // Event Delegation for Tabs
    content.onclick = (e) => {
        const tabItem = e.target.closest('.tab-item');
        if (tabItem) {
            const newTab = tabItem.dataset.tab;
            if (newTab !== activeTab) {
                activeTab = newTab;
                content.innerHTML = renderTabs();
                // Re-initialize editors if needed
                if (activeTab === 'response') initResponseEditor(request);
                if (activeTab === 'request') initRequestEditor(request);
            }
        }
    };

    // Initial Editor Load
    if (activeTab === 'response') initResponseEditor(request);
}

function renderTabContent(tabId, request) {
    switch (tabId) {
        case 'headers':
            return renderHeadersTab(request);
        case 'cookies':
            return renderCookiesTab(request);
        case 'request':
            return renderRequestTab(request);
        case 'response':
            return renderResponseTab(request);
        case 'timings':
            return renderTimingsTab(request);
        case 'security':
            return renderSecurityTab(request);
        default:
            return '';
    }
}

function renderHeadersTab(request) {
    const formatHeaderSection = (title, headers) => {
        if (!headers || Object.keys(headers).length === 0) return '';
        const rows = Object.entries(headers).map(([k, v]) => `
            <tr>
                <td style="font-weight: 500; color: var(--text-secondary); padding: 4px 8px; vertical-align: top;">${k}:</td>
                <td style="word-break: break-all; padding: 4px 8px;">${v}</td>
            </tr>
        `).join('');
        return `
            <details open style="margin-bottom: 1rem;">
                <summary style="font-weight: bold; padding: 4px 0; cursor: pointer; color: var(--text-primary);">${title}</summary>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                    ${rows}
                </table>
            </details>
        `;
    };

    return `
        <div style="padding: 0 0.5rem;">
            <details open style="margin-bottom: 1rem;">
                <summary style="font-weight: bold; padding: 4px 0; cursor: pointer; color: var(--text-primary);">General</summary>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 0.9em; padding-left: 8px;">
                     <div style="color: var(--text-secondary);">Request URL:</div><div style="word-break: break-all;">${request.url}</div>
                     <div style="color: var(--text-secondary);">Request Method:</div><div>${request.method}</div>
                     <div style="color: var(--text-secondary);">Status Code:</div><div>${request.status}</div>
                     <div style="color: var(--text-secondary);">Remote Address:</div><div>${request.remoteIP || '-'}</div>
                     <div style="color: var(--text-secondary);">Referrer Policy:</div><div>${request.requestHeaders?.['referrer-policy'] || 'strict-origin-when-cross-origin'}</div>
                </div>
            </details>
            ${formatHeaderSection('Response Headers', request.responseHeaders)}
            ${formatHeaderSection('Request Headers', request.requestHeaders)}
        </div>
    `;
}

function renderCookiesTab(request) {
    // Parse Cookies
    const reqCookies = request.requestHeaders?.['cookie']
        ? request.requestHeaders['cookie'].split(';').map(c => {
            const [k, v] = c.trim().split('=');
            return { name: k, value: v };
        })
        : [];

    // Naive Set-Cookie parsing (often an array, but we might have it merged or as single string depending on collection)
    // If headers are just Record<string, string>, Set-Cookie might be joined by comma, which is bad for automated parsing if values contain commas.
    // For now, let's assume one or basic parsing.
    let resCookies = [];
    if (request.responseHeaders?.['set-cookie']) {
        // This is tricky if multiple set-cookies are merged. 
        // Assuming a simple array or single string for now.
        // If generic Record<string,string> was used, multiple set-cookies might be lost or merged.
        // We'll display what we have.
        resCookies = [{ name: 'Set-Cookie', value: request.responseHeaders['set-cookie'] }];
    }

    const renderTable = (cookies) => {
        if (!cookies.length) return '<div style="padding: 8px; color: var(--text-secondary);">No cookies found</div>';
        return `
            <table style="width: 100%; text-align: left; border-collapse: collapse; font-size: 0.9em;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <th style="padding: 4px 8px;">Name</th>
                        <th style="padding: 4px 8px;">Value</th>
                    </tr>
                </thead>
                <tbody>
                    ${cookies.map(c => `
                        <tr style="border-bottom: 1px solid var(--border-color-dim, #33333333);">
                            <td style="padding: 4px 8px; font-weight: 500;">${c.name}</td>
                            <td style="padding: 4px 8px; word-break: break-all;">${c.value}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    };

    return `
        <div style="padding: 0 0.5rem; display: flex; flex-direction: column; gap: 1rem;">
            <div>
                <div style="font-weight: bold; margin-bottom: 0.5rem;">Request Cookies</div>
                ${renderTable(reqCookies)}
            </div>
            <div>
                <div style="font-weight: bold; margin-bottom: 0.5rem;">Response Cookies</div>
                ${renderTable(resCookies)}
            </div>
        </div>
    `;
}

function renderRequestTab(request) {
    if (!request.requestBody && !request.body) return '<div style="padding: 1rem; color: var(--text-secondary);">No payload</div>';
    return `
        <div style="display: flex; flex-direction: column; height: 100%;">
             <div style="display: flex; justify-content: flex-end; padding: 4px;">
                <button class="btn-action" onclick="copyToClipboard(currentRequestBody)">Copy</button>
            </div>
            <div id="request-body-editor" style="flex: 1; border: 1px solid var(--border-color); border-radius: 4px; overflow: hidden; min-height: 200px;"></div>
        </div>
    `;
}

function renderResponseTab(request) {
    if (!request.responseBody && !request.body) return '<div style="padding: 1rem; color: var(--text-secondary);">No content</div>';

    return `
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px; border-bottom: 1px solid var(--border-color);">
                <div style="font-size: 0.8em; color: var(--text-secondary);">${formatBytes(request.size || 0)}</div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <label style="display: flex; align-items: center; gap: 4px; font-size: 0.8rem; cursor: pointer; user-select: none;">
                        <input type="checkbox" id="auto-format-check" ${window.autoFormatEnabled !== false ? 'checked' : ''}> Format
                    </label>
                    <div style="width: 1px; height: 16px; background: var(--border-color); margin: 0 4px;"></div>
                    <button id="btn-copy-body" class="btn-action" title="Copy Body">Copy</button>
                    <button id="btn-download-body" class="btn-action" title="Download Body">Download</button>
                </div>
            </div>
            <div id="response-body-editor" style="flex: 1; border: 1px solid var(--border-color); border-radius: 4px; overflow: hidden; min-height: 200px;"></div>
        </div>
    `;
}

function renderTimingsTab(request) {
    // Placeholder for timings visualization
    return `
        <div style="padding: 1rem;">
             <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px; max-width: 400px; font-size: 0.9em;">
                <div>Started At:</div><div>${new Date(request.timestamp).toLocaleString()}</div>
                <div>Duration:</div><div>${request.duration.toFixed(2)} ms</div>
                <div style="border-top: 1px solid var(--border-color); margin-top:8px; padding-top:8px; font-weight:bold;">Total Transferred:</div><div style="border-top: 1px solid var(--border-color); margin-top:8px; padding-top:8px; font-weight:bold;">${formatBytes(request.transferred || request.size || 0)}</div>
             </div>
             <!-- Future: detailed breakdown -->
        </div>
    `;
}

function renderSecurityTab(request) {
    return `
        <div style="padding: 1rem;">
            <div style="margin-bottom: 1rem; font-weight: bold;">Connection</div>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 0.9em;">
                <div style="color: var(--text-secondary);">Protocol:</div><div>${request.protocol || request.scheme || 'tls'}</div>
                <div style="color: var(--text-secondary);">Remote Address:</div><div>${request.remoteIP || 'Unknown'}</div>
            </div>
             <div style="margin-top: 1rem; color: var(--text-secondary); font-style: italic;">
                Detailed certificate information is not currently captured by the interceptor.
            </div>
        </div>
    `;
}


// Attach event listeners
// document.getElementById('auto-format-check').onchange = (e) => {
//     window.autoFormatEnabled = e.target.checked;
//     renderMonacoEditor(request);
// };


function closeRequestDetails() {
    document.getElementById('request-details-container').style.display = 'none';
    if (window.requestsTable) window.requestsTable.redraw();
}
window.closeRequestDetails = closeRequestDetails;

function renderTrace(request, container) {
    if (request.handlerStack && request.handlerStack.length > 0) {
        const totalDuration = request.duration || 1;
        let html = '<div style="display: flex; flex-direction: column; gap: 4px;">';

        request.handlerStack.forEach((item, index) => {
            const duration = item.duration > 0 ? item.duration : 0.01;
            const percent = Math.min(100, Math.max(1, (duration / totalDuration) * 100));
            const isSlow = percent > 15;

            html += `
            <div style="padding: 8px; border-radius: 4px; background: var(--bg-primary); border-left: 3px solid ${isSlow ? 'var(--color-warning)' : 'var(--color-success)'};">
                <div style="display: flex; justify-content: space-between; font-size: 0.9em;">
                    <span style="font-weight: 500;">${item.name}</span>
                    <span style="font-family: monospace;">${printDuration(duration)}</span>
                </div>
                <div style="height: 3px; background: var(--bg-secondary); margin-top: 4px; border-radius: 2px; overflow: hidden;">
                     <div style="height: 100%; width: ${percent}%; background: ${isSlow ? 'var(--color-warning)' : 'var(--color-success)'}; opacity: 0.8;"></div>
                </div>
            </div>`;

            if (index < request.handlerStack.length - 1) {
                html += `<div style="display: flex; justify-content: center; height: 10px;"><div style="width: 1px; background: var(--border-color); opacity: 0.5;"></div></div>`;
            }
        });
        html += '</div>';
        container.innerHTML = html;
    } else {
        container.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">No trace data</div>`;
    }
}

function getExtension(contentType) {
    if (!contentType) return 'txt';
    if (contentType.includes('json')) return 'json';
    if (contentType.includes('html')) return 'html';
    if (contentType.includes('xml')) return 'xml';
    if (contentType.includes('javascript')) return 'js';
    if (contentType.includes('css')) return 'css';
    return 'txt';
}

function getRequestBody(request) {
    let value = request.body || '';
    if (typeof value === 'object') {
        try {
            value = JSON.stringify(value, null, 2);
        } catch (e) {
            value = String(value);
        }
    } else {
        value = String(value);
    }
    return value;
}

let currentRequestBody = ''; // Global/Module scope tracking for request body

function initRequestEditor(request) {
    const el = document.getElementById('request-body-editor');
    if (!el) return;

    let content = request.requestBody || request.body || '';
    let language = 'plaintext';
    const contentType = (request.requestHeaders?.['content-type'] || '').toLowerCase();

    if (contentType.includes('json')) language = 'json';
    else if (contentType.includes('html')) language = 'html';
    else if (contentType.includes('xml')) language = 'xml';
    else if (contentType.includes('javascript') || contentType.includes('application/x-javascript')) language = 'javascript';
    else if (contentType.includes('css')) language = 'css';
    else if (contentType.includes('typescript')) language = 'typescript';
    else if (contentType.includes('markdown')) language = 'markdown';
    else if (contentType.includes('sql')) language = 'sql';
    else if (contentType.includes('yaml')) language = 'yaml';

    if (typeof content === 'object') {
        content = JSON.stringify(content, null, 2);
        language = 'json';
    } else if (typeof content === 'string') {
        // Auto-detect JSON if content looks like JSON but header is wrong
        if (language === 'plaintext' && (content.trim().startsWith('{') || content.trim().startsWith('['))) {
            try {
                JSON.parse(content);
                language = 'json';
            } catch (e) { /* not json */ }
        }
    }

    currentRequestBody = content; // store for copy

    renderMonacoEditor(el, content, language, false); // Request body usually not auto-formatted
}

function initResponseEditor(request) {
    const el = document.getElementById('response-body-editor');
    if (!el) return;

    let content = request.body || request.responseBody;
    let contentType = request.contentType || '';

    if (!content) content = '';

    // Auto-Format Logic
    let language = 'plaintext';
    if (contentType.includes('json')) language = 'json';
    else if (contentType.includes('html')) language = 'html';
    else if (contentType.includes('xml')) language = 'xml';
    else if (contentType.includes('javascript') || contentType.includes('application/x-javascript')) language = 'javascript';
    else if (contentType.includes('css')) language = 'css';
    else if (contentType.includes('typescript')) language = 'typescript';
    else if (contentType.includes('markdown')) language = 'markdown';
    else if (contentType.includes('sql')) language = 'sql';
    else if (contentType.includes('yaml')) language = 'yaml';

    if (typeof content === 'object') {
        content = JSON.stringify(content, null, 2);
        language = 'json';
    } else if (window.autoFormatEnabled !== false && typeof content === 'string') {
        // Try auto-detect JSON if string
        if ((content.trim().startsWith('{') || content.trim().startsWith('[')) && content.length < 524288) {
            try {
                const parsed = JSON.parse(content);
                content = JSON.stringify(parsed, null, 2);
                language = 'json';
            } catch (e) { /* not json */ }
        }
    }

    renderMonacoEditor(el, content, language, window.autoFormatEnabled !== false);

    // Attach button listeners
    const btnCopy = document.getElementById('btn-copy-body');
    const btnDownload = document.getElementById('btn-download-body');
    if (btnCopy) btnCopy.onclick = () => copyToClipboard(getRequestBody(request));
    if (btnDownload) btnDownload.onclick = () => downloadString(getRequestBody(request), `body-${request.timestamp}.${getExtension(request.contentType)}`);
}

let currentMonacoEditor = null; // To manage the active editor instance

function renderMonacoEditor(containerElement, value, language, shouldFormat = false) {
    if (!window.monaco) {
        require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
        require(['vs/editor/editor.main'], function () { renderMonacoEditor(containerElement, value, language, shouldFormat); });
        return;
    }

    window.currentEditor = monaco.editor.create(containerElement, {
        value: value,
        language: language,
        theme: 'vs-dark',
        readOnly: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: 'on'
    });

    if (shouldFormat) {
        setTimeout(() => {
            if (window.currentEditor) {
                window.currentEditor.getAction('editor.action.formatDocument').run();
            }
        }, 100);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.activeElement;
        if (btn && btn.tagName === 'BUTTON') {
            const original = btn.innerText;
            btn.innerText = 'Copied!';
            setTimeout(() => btn.innerText = original, 1500);
        }
    }).catch(err => console.error('Failed to copy', err));
}

function downloadString(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

window.updateRequestsList = function (newRequests) {
    if (!window.requestsTable || !newRequests || newRequests.length === 0) return;

    // console.log('[requests.js] Adding/Updating', newRequests.length, 'rows');
    window.requestsTable.updateOrAddData(newRequests)
        .then(() => {
            // Force redraw/filter application
            window.requestsTable.recalc();
            window.requestsTable.redraw();
            // console.log('[requests.js] Table updated');
        })
        .catch(err => console.error("Failed to update table data", err));
};
