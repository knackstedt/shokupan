
// Initialize Requests Table
window.requestsTable = null;

// Filter State
// Initialize Filter State
let filterText = '';
let filterType = 'all';
let filterDirection = 'all';
let filterIgnore = true;
let ignoreRegexes = [];

function globToRegex(pattern) {
    // Escape special regex chars except *
    let escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Convert * to .*
    // For ** support, we can just treat * as .* for now, or distinguish.
    // Simple approach: replace * with .*
    // Note: This is a loose approximation of glob
    const re = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${re}$`);
}

// Waterfall State
let minRequestTime = Infinity;
let maxRequestTime = 0;

function initRequests() {
    console.log('[requests.js] Initializing...');

    if (window.updateRequestsList) console.log('[requests.js] updateRequestsList is already defined!');
    else console.log('[requests.js] Defining updateRequestsList...');

    // Initialize Filter Listeners
    const txtFilter = document.getElementById('network-filter-text');
    const typeFilter = document.getElementById('network-filter-type');
    const ignoreFilter = document.getElementById('network-filter-ignore');
    const directionButtons = document.querySelectorAll('.filter-direction');

    // Compile regexes
    if (window.SHOKUPAN_CONFIG && window.SHOKUPAN_CONFIG.ignorePaths) {
        ignoreRegexes = window.SHOKUPAN_CONFIG.ignorePaths.map(globToRegex);
    }

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

    if (ignoreFilter) {
        // specific listener
        ignoreFilter.addEventListener('change', (e) => {
            filterIgnore = e.target.checked;
            window.requestsTable.setFilter(customFilter);
        });
        filterIgnore = ignoreFilter.checked;
    }

    // specific check for Tabulator
    if (typeof Tabulator === 'undefined') {
        console.error('Tabulator is not defined. Ensure it is loaded before requests.js');
        return;
    }

    // Load saved column state
    let savedColumns = {};
    try {
        const stored = localStorage.getItem('shokupan_dashboard_columns');
        if (stored) savedColumns = JSON.parse(stored);
    } catch (e) {
        console.error("Failed to load column state", e);
    }

    function saveColumnState() {
        if (!window.requestsTable) return;
        const cols = window.requestsTable.getColumns();
        const state = {};
        cols.forEach(c => {
            state[c.getField()] = c.isVisible();
        });
        localStorage.setItem('shokupan_dashboard_columns', JSON.stringify(state));
    }

    const headerMenu = [
        {
            label: "Hide Column",
            action: function (e, column) {
                column.hide();
                saveColumnState();
            }
        },
        {
            separator: true,
        },
        {
            label: "Select Columns",
            menu: []
        }
    ];

    const columns = [
        {
            title: "Status",
            field: "status",
            width: 100,
            visible: savedColumns['status'] !== undefined ? savedColumns['status'] : true,
            formatter: function (cell) {
                const status = cell.getValue();
                if (!status) return '<span style="color: var(--text-secondary)">Pending</span>';
                const color = status >= 500 ? '#ef4444' : status >= 400 ? '#f59e0b' : '#10b981';
                return `<span style="display: inline-block; width: 10px; height: 10px; background: ${color}; border-radius: 50%; margin-right: 6px;"></span>${status}`;
            },
            headerContextMenu: headerMenu
        },
        {
            title: "Method",
            field: "method",
            width: 90,
            headerSort: false,
            visible: savedColumns['method'] !== undefined ? savedColumns['method'] : true,
            headerContextMenu: headerMenu
        },
        {
            title: "Name",
            field: "url",
            widthGrow: 2, // Take up more space
            visible: savedColumns['url'] !== undefined ? savedColumns['url'] : true,
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
                        <span style="color: var(--text-secondary);">${escapeHtml(name)}</span>
                    </div>`;
            },
            headerContextMenu: headerMenu
        },
        {
            title: "Domain",
            field: "domain",
            width: 80,
            visible: savedColumns['domain'] !== undefined ? savedColumns['domain'] : false,
            headerContextMenu: headerMenu
        },
        {
            title: "Path",
            field: "path",
            width: 80,
            visible: savedColumns['path'] !== undefined ? savedColumns['path'] : true,
            headerContextMenu: headerMenu
        },
        {
            title: "URL",
            field: "url",
            width: 80,
            visible: savedColumns['url'] !== undefined ? savedColumns['url'] : false,
            headerContextMenu: headerMenu
        },
        {
            title: "Protocol",
            field: "protocol",
            width: 80,
            visible: savedColumns['protocol'] !== undefined ? savedColumns['protocol'] : false,
            formatter: function (cell) {
                const row = cell.getData();
                // Prefer explicit protocol version (e.g. 1.1, h2) if available
                if (row.protocol && row.protocol !== 'http' && row.protocol !== 'https') return escapeHtml(row.protocol);
                return escapeHtml(row.scheme || row.protocol || '-');
            },
            headerContextMenu: headerMenu
        },
        {
            title: "Scheme",
            field: "scheme",
            width: 80,
            visible: savedColumns['scheme'] !== undefined ? savedColumns['scheme'] : false,
            headerContextMenu: headerMenu
        },
        {
            title: "Remote IP",
            field: "remoteIP",
            width: 80,
            visible: savedColumns['remoteIP'] !== undefined ? savedColumns['remoteIP'] : true,
            headerContextMenu: headerMenu
        },
        {
            title: "Initiator",
            field: "direction",
            width: 80,
            visible: savedColumns['direction'] !== undefined ? savedColumns['direction'] : false,
            formatter: (cell) => {
                const dir = cell.getValue();
                return dir === 'outbound' ? 'Server' : 'Client';
            },
            headerContextMenu: headerMenu
        },
        {
            title: "Type",
            field: "type",
            width: 80,
            visible: savedColumns['type'] !== undefined ? savedColumns['type'] : false,
            formatter: (cell) => {
                const r = cell.getData();
                if (r.type === 'fetch') return 'fetch';
                if (r.type === 'xhr') return 'xhr';
                if (r.type === 'ws') return 'ws';
                return escapeHtml(r.contentType || 'document');
            },
            headerContextMenu: headerMenu
        },
        {
            title: "Cookies",
            field: "cookies",
            width: 80,
            visible: savedColumns['cookies'] !== undefined ? savedColumns['cookies'] : false,
            headerContextMenu: headerMenu
        },
        {
            title: "Transferred",
            field: "transferred",
            width: 80,
            visible: savedColumns['transferred'] !== undefined ? savedColumns['transferred'] : false,
            headerContextMenu: headerMenu
        },
        {
            title: "Size",
            field: "size",
            width: 110,
            visible: savedColumns['size'] !== undefined ? savedColumns['size'] : true,
            formatter: (cell) => formatBytes(cell.getValue()),
            headerContextMenu: headerMenu
        },
        {
            title: "Time",
            field: "duration",
            width: 90,
            visible: savedColumns['duration'] !== undefined ? savedColumns['duration'] : true,
            formatter: (cell) => cell.getValue() ? Math.round(cell.getValue()) + ' ms' : 'Pending',
            headerContextMenu: headerMenu
        },
        {
            title: "Waterfall",
            field: "timestamp",
            widthGrow: 1,
            visible: savedColumns['timestamp'] !== undefined ? savedColumns['timestamp'] : true,
            formatter: waterfallFormatter,
            headerSort: true,
            headerContextMenu: headerMenu
        }
    ];

    const checkMark = `<svg fill="currentColor" width="16px" height="16px" style="padding: 2px; margin-right: 2px" viewBox="0 0 1024 1024"><path d="M351.605 663.268l481.761-481.761c28.677-28.677 75.171-28.677 103.847 0s28.677 75.171 0 103.847L455.452 767.115l.539.539-58.592 58.592c-24.994 24.994-65.516 24.994-90.51 0L85.507 604.864c-28.677-28.677-28.677-75.171 0-103.847s75.171-28.677 103.847 0l162.25 162.25z"/></svg>`;
    const uncheckMark = `<span style="width: 18px; display: inline-block"></span>`;

    const subMenu = [];
    columns.forEach((col, idx) => {
        subMenu.push({
            label: (col.visible ? checkMark : uncheckMark) + " " + col.title,
            action: function (e) {
                // const cols = window.requestsTable.getColumns();
                // cols.forEach((c, i) => {
                //     if (idx === i) c.toggle();
                // });
                columns[idx].visible = !columns[idx].visible;
                subMenu[idx].label = (columns[idx].visible ? checkMark : uncheckMark) + " " + columns[idx].title;
                if (window.requestsTable) {
                    window.requestsTable.redraw();
                    window.requestsTable.setColumns(columns);
                    saveColumnState();
                };
            }
        });
    });
    headerMenu[2].menu = subMenu;

    window.requestsTable = new Tabulator("#requests-list-container", {
        layout: "fitColumns",
        responsiveLayout: true,
        resizableColumnGuide: true,
        resizableColumnFit: true,
        placeholder: "No requests found",
        selectableRows: 1,
        height: "100%", // Fill container
        index: "id",
        rowHeight: 32, // Dense rows
        initialSort: [
            { column: "timestamp", dir: "desc" }
        ],
        columns: columns,
        data: [],
        rowContextMenu: [
            {
                label: "Replay Request",
                action: function (e, row) {
                    const data = row.getData();
                    openReplayModal(data);
                }
            },
            {
                label: "Copy as fetch",
                action: function (e, row) {
                    const data = row.getData();
                    const fetchCode = generateFetchCode(data);
                    copyToClipboard(fetchCode);
                }
            },
            {
                label: "Export as HAR",
                action: function (e, row) {
                    const data = row.getData();
                    const har = generateHAR([data]);
                    downloadString(JSON.stringify(har, null, 2), `request-${data.id}.har`);
                }
            },
            {
                label: "Export All as HAR",
                action: function (e, row) {
                    const allData = window.requestsTable.getData("active"); // get filtered data
                    const har = generateHAR(allData);
                    downloadString(JSON.stringify(har, null, 2), `requests-export.har`);
                }
            }
        ]
    });

    // Row selection handler
    window.requestsTable.on("rowClick", function (e, row) {
        showRequestDetails(row.getData());
    });

    // Auto-fetch on load
    fetchRequests();

    // Resize Logic
    initResizeHandle();
}

function initResizeHandle() {
    const handle = document.getElementById('details-drag-handle');
    const container = document.getElementById('request-details-container');

    if (!handle || !container) return;

    let isResizing = false;
    let startX, startWidth;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = container.offsetWidth;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        // Calculate new width: It's expanding to the left, so moving mouse left increases width
        const dx = startX - e.clientX;
        const newWidth = Math.max(300, Math.min(window.innerWidth - 100, startWidth + dx));
        container.style.width = `${newWidth}px`;

        // Optional: trigger tabulator redraw if list container size changed significantly (it flexes)
        if (window.requestsTable) window.requestsTable.redraw();
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            // Save width preference?
            if (window.requestsTable) window.requestsTable.redraw();
        }
    });

}

function generateFetchCode(req) {
    const headers = req.requestHeaders || {};
    let code = `fetch("${req.url}", {\n`;
    code += `  "method": "${req.method}",\n`;
    code += `  "headers": ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},\n`;

    if (req.requestBody) {
        if (typeof req.requestBody === 'object') {
            code += `  "body": JSON.stringify(${JSON.stringify(req.requestBody)}),\n`;
        } else {
            code += `  "body": ${JSON.stringify(req.requestBody)},\n`;
        }
    }
    code += `});`;
    return code;
}

function generateHAR(requests) {
    return {
        log: {
            version: "1.2",
            creator: { name: "Shokupan Dashboard", version: "1.0" },
            entries: requests.map(req => ({
                startedDateTime: new Date(req.timestamp).toISOString(),
                time: req.duration,
                request: {
                    method: req.method,
                    url: req.url,
                    httpVersion: req.protocol || "HTTP/1.1",
                    cookies: [], // Todo parse
                    headers: Object.entries(req.requestHeaders || {}).map(([name, value]) => ({ name, value })),
                    queryString: [], // Todo parse from url
                    postData: req.requestBody ? { mimeType: req.contentType || "application/json", text: JSON.stringify(req.requestBody) } : undefined,
                    headersSize: -1,
                    bodySize: -1
                },
                response: {
                    status: req.status,
                    statusText: "",
                    httpVersion: req.protocol || "HTTP/1.1",
                    cookies: [],
                    headers: Object.entries(req.responseHeaders || {}).map(([name, value]) => ({ name, value })),
                    content: {
                        size: req.size || 0,
                        mimeType: req.contentType || "",
                        text: typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
                    },
                    redirectURL: "",
                    headersSize: -1,
                    bodySize: -1
                },
                cache: {},
                timings: {
                    send: 0,
                    wait: req.duration,
                    receive: 0
                }
            }))
        }
    };
}

function purgeRequests() {
    if (!confirm("Are you sure you want to purge all captured requests?")) return;

    const headers = typeof getRequestHeaders !== 'undefined' ? getRequestHeaders() : {};
    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname.slice(0, -1) : window.location.pathname;
    // Need to handle if we are mounted at /dashboard vs /dashboard/ so stripping slice(-1) might be wrong if it wasn't there
    // Safer:
    let base = window.location.pathname;
    if (base.endsWith('/')) base = base.slice(0, -1);

    fetch(base + '/requests', {
        method: 'DELETE',
        headers
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                console.log("Purge successful");
                if (window.requestsTable) window.requestsTable.clearData();
                closeRequestDetails();
            }
        })
        .catch(console.error);
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

    // Ignore Filter
    if (filterIgnore && ignoreRegexes.length > 0) {
        // check against regexes
        // We match against URL or Path?
        // Usually path.
        // data.url might be full URL. data.path is path.
        const path = data.path || data.url; // Fallback
        // Also check full URL just in case glob is absolute?
        // Let's assume glob matches against path.
        for (const re of ignoreRegexes) {
            if (re.test(path)) return false;
        }
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
    // Default to duration bar if no range yet
    const duration = data.duration || 0;

    // Safety check
    if (minRequestTime === Infinity || maxRequestTime === 0) {
        // Just show a simple bar based on some 2s default
        const pct = Math.min(100, (duration / 2000) * 100);
        const color = duration > 1000 ? '#ef4444' : duration > 500 ? '#f59e0b' : '#3b82f6';
        return `<div style="width: 100%; height: 100%; display: flex; align-items: center;">
            <div style="height: calc(100% - 4px); width: ${pct}%; background: ${color}; border-radius: 3px; min-width: 2px;"></div>
        </div>`;
    }

    const totalRange = maxRequestTime - minRequestTime;
    // Prevent divide by zero
    const safeRange = totalRange <= 0 ? 1 : totalRange;

    // Calculate start offset relative to minRequestTime
    // We treat minRequestTime as 0%
    // If a request started before minRequestTime (unlikely given logic), clamp to 0
    const startTimeResult = data.timestamp - minRequestTime;
    const startPct = Math.max(0, (startTimeResult / safeRange) * 100);

    // Calculate width relative to totalRange
    // Use a min width of 0.5% so it's visible
    const widthPct = Math.max(0.5, (duration / safeRange) * 100);

    // Color
    const color = duration > 1000 ? '#ef4444' : duration > 500 ? '#f59e0b' : '#3b82f6';

    return `<div style="width: 100%; height: 100%; display: flex; align-items: center; position: relative;">
        <div style="
            position: absolute;
            left: min(${startPct}%, calc(100% - 2px));
            width: ${widthPct}%;
            height: calc(100% - 4px); 
            background: ${color}; 
            border-radius: 3px; 
            min-width: 2px;
        " title="Start: +${Math.round(startTimeResult)}ms, Duration: ${Math.round(duration)}ms"></div>
    </div>`;
}

// Utility to track time range
function updateTimestamps(requests) {
    if (!requests || !requests.length) return;
    let changed = false;
    requests.forEach(r => {
        const start = r.timestamp;
        const end = start + (r.duration || 0);
        if (start < minRequestTime) {
            minRequestTime = start;
            changed = true;
        }
        // Also extend max if needed, but generally max is max(end)
        // However, waterfall usually shows relative to session start.
        // If we want "waterfall of current view", we care about min/max of visible.
        // But for simplicity, we track global session range.
        if (end > maxRequestTime) {
            maxRequestTime = end;
            changed = true;
        }
        // Also handle if start > maxRequestTime (e.g. first request)
        if (start > maxRequestTime) {
            maxRequestTime = end; // start + duration
            changed = true;
        }
    });
    return changed;
}

// Global handler for Client.js
window.updateRequestsList = function (newRequests) {
    console.log('[requests.js] updateRequestsList called with', newRequests ? newRequests.length : 0, 'items');
    if (!window.requestsTable) {
        console.warn('[requests.js] requestsTable is missing!');
        return;
    }
    if (!newRequests || !newRequests.length) return;

    // Update Timestamps
    const changed = updateTimestamps(newRequests);

    // Add or Update data (true = add to top if new)
    // using updateOrAddData to be safe if IDs exist
    window.requestsTable.updateOrAddData(newRequests)
        .then(() => {
            // If range expanded significantly, or just always for safety to update relative bars
            if (changed) {
                // redraw(true) forces full re-render of rows
                window.requestsTable.redraw(true);
            }
        });
};



function fetchRequests() {
    const headers = typeof getRequestHeaders !== 'undefined' ? getRequestHeaders() : {};
    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname.slice(0, -1) : window.location.pathname;
    const url = basePath + '/requests';

    fetch(url, { headers })
        .then(res => res.json())
        .then(data => {
            if (window.requestsTable) {
                const reqs = data.requests || [];
                // Reset timestamps on full load/reload
                minRequestTime = Infinity;
                maxRequestTime = 0;
                updateTimestamps(reqs);

                window.requestsTable.setData(reqs);
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

    container.style.display = 'flex';
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

    // Add Middleware tab if we have handler stack data with state changes
    if (request.handlerStack && request.handlerStack.some(h => h.stateChanges && Object.keys(h.stateChanges).length > 0)) {
        tabs.splice(5, 0, { id: 'middleware', label: 'Middleware' });
    }

    if (request.scheme === 'https' || request.scheme === 'wss') {
        tabs.push({ id: 'security', label: 'Security' });
    }

    let activeTab = 'headers';

    function renderTabs() {
        return `
            <div class="tabs-header" style="display: flex; border-bottom: 1px solid var(--border-color)">
                ${tabs.map(tab => `
                    <div class="tab-item ${tab.id === activeTab ? 'active' : ''}" 
                         data-tab="${tab.id}"
                         style="padding: 8px 16px; cursor: pointer; border-bottom: 2px solid ${tab.id === activeTab ? 'var(--primary-color, #3b82f6)' : 'transparent'}; color: ${tab.id === activeTab ? 'var(--text-primary)' : 'var(--text-secondary)'};">
                        ${tab.label}
                    </div>
                `).join('')}
            </div>
            <div id="tab-content" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; padding: 1rem">
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
                document.querySelector("#tab-content").style.padding = "1rem";

                if (activeTab === "timings") {
                    const traceContainer = document.getElementById('middleware-trace-container');
                    renderTrace(request, traceContainer);
                }

                // Re-initialize editors if needed
                if (activeTab === 'response') {
                    document.querySelector("#tab-content").style.padding = "0";
                    initResponseEditor(request);
                };
                if (activeTab === 'request') {
                    document.querySelector("#tab-content").style.padding = "0";
                    initRequestEditor(request);
                };
            }
        }
    };

    if (activeTab === "timings") {
        const traceContainer = document.getElementById('middleware-trace-container');
        renderTrace(request, traceContainer);
    }
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
        case 'middleware':
            return renderMiddlewareTab(request);
        case 'security':
            return renderSecurityTab(request);
        default:
            return '';
    }
}

// Utility
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderNameValueTable(items, emptyMessage = 'No items found') {
    if (!items || !items.length) return `<div style="padding: 8px; color: var(--text-secondary);">${emptyMessage}</div>`;
    return `
        <table style="width: 100%; text-align: left; border-collapse: collapse; font-size: 0.9em;">
            <thead>
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <th style="padding: 4px 8px;">Name</th>
                    <th style="padding: 4px 8px;">Value</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(c => `
                    <tr style="border-bottom: 1px solid var(--border-color-dim, #33333333);">
                        <td style="padding: 4px 8px; font-weight: 500;">${escapeHtml(c.name)}</td>
                        <td style="padding: 4px 8px; word-break: break-all;">${escapeHtml(c.value)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderHeadersTab(request) {
    const formatHeaderSection = (title, headers) => {
        if (!headers || Object.keys(headers).length === 0) return '';
        const rows = Object.entries(headers).map(([k, v]) => `
            <tr>
                <td style="font-weight: 500; color: var(--text-flavor); padding: 4px 8px; vertical-align: top;">${escapeHtml(k)}:</td>
                <td style="word-break: break-all; padding: 4px 8px;">${escapeHtml(v)}</td>
            </tr>
        `).join('');
        return `
            <details open style="margin-bottom: 1rem;">
                <summary style="font-weight: bold; padding: 4px 0; cursor: pointer; color: var(--text-primary);">${escapeHtml(title)}</summary>
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
                     <div style="color: var(--text-flavor);">Request URL:</div><div style="word-break: break-all;">${escapeHtml(request.url)}</div>
                     <div style="color: var(--text-flavor);">Request Method:</div><div>${escapeHtml(request.method)}</div>
                     <div style="color: var(--text-flavor);">Status Code:</div><div>${escapeHtml(request.status)}</div>
                     <div style="color: var(--text-flavor);">Remote Address:</div><div>${escapeHtml(request.remoteIP || '-')}</div>
                     <div style="color: var(--text-flavor);">Referrer Policy:</div><div>${escapeHtml(request.requestHeaders?.['referrer-policy'] || 'strict-origin-when-cross-origin')}</div>
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

    return `
        <div style="padding: 0 0.5rem; display: flex; flex-direction: column; gap: 1rem;">
            <div>
                <div style="font-weight: bold; margin-bottom: 0.5rem;">Request Cookies</div>
                ${renderNameValueTable(reqCookies, 'No cookies found')}
            </div>
            <div>
                <div style="font-weight: bold; margin-bottom: 0.5rem;">Response Cookies</div>
                ${renderNameValueTable(resCookies, 'No cookies found')}
            </div>
        </div>
    `;
}

function renderRequestTab(request) {
    let queryParamsHtml = '';
    try {
        const url = new URL(request.url.startsWith('http') ? request.url : `http://${request.domain || 'localhost'}${request.url}`);
        const params = [];
        for (const [key, value] of url.searchParams) {
            params.push({ name: key, value: value });
        }

        if (params.length > 0) {
            queryParamsHtml = `
                <div style="margin-bottom: 1rem;">
                    <div style="font-weight: bold; margin-bottom: 0.5rem; color: var(--text-primary);">Query Parameters</div>
                    ${renderNameValueTable(params)}
                </div>
            `;
        }
    } catch (e) {
        console.error("Failed to parse URL for query params", e);
    }

    const hasBody = request.requestBody || request.body || (typeof request.requestBody === 'string' && request.requestBody.length > 0);

    if (!hasBody && !queryParamsHtml) return '<div style="padding: 1rem; color: var(--text-secondary);">No payload or query parameters</div>';

    return `
        <div style="display: flex; flex-direction: column; height: 100%;">
            ${queryParamsHtml}
             <div style="display: flex; justify-content: flex-end; padding: 4px; gap: 8px;">
                <div style="font-size: 0.8em; color: var(--text-secondary); display: flex; align-items: center;">${request.requestBody ? formatBytes(request.requestBody.length || 0) : ''}</div>
                <button class="btn-action" id="btn-copy-req-body">Copy</button>
            </div>
            <div id="request-body-editor" style="flex: 1; border: 1px solid var(--border-color); border-radius: 4px; overflow: hidden; min-height: 200px;"></div>
        </div>
    `;
}

function renderResponseTab(request) {
    if (!request.responseBody && !request.body) return '<div style="padding: 1rem; color: var(--text-secondary);">No content</div>';

    return `
        <div style="display: flex; flex-direction: column; height: 100%">
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
             <div class="card-title" style="margin-top: 1rem; padding: 0">Middleware Trace</div>
             <div id="middleware-trace-container"></div>
        </div>
    `;
}

function renderSecurityTab(request) {
    return `
        <div style="padding: 1rem;">
            <div style="margin-bottom: 1rem; font-weight: bold;">Connection</div>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 0.9em;">
                <div style="color: var(--text-flavor);">Protocol:</div><div>${request.protocol || request.scheme || 'tls'}</div>
                <div style="color: var(--text-flavor);">Remote Address:</div><div>${request.remoteIP || 'Unknown'}</div>
            </div>
             <div style="margin-top: 1rem; color: var(--text-secondary); font-style: italic;">
                Detailed certificate information is not currently captured by the interceptor.
            </div>
        </div>
    `;
}

function renderMiddlewareTab(request) {
    if (!request.handlerStack || request.handlerStack.length === 0) {
        return `
            <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                No middleware tracking data available.
                <br><br>
                Enable middleware tracking by setting <code style="background: var(--bg-primary); padding: 2px 6px; border-radius: 3px;">enableMiddlewareTracking: true</code> in your application config.
            </div>
        `;
    }

    const totalDuration = request.duration || 1;
    const formatValue = (val) => {
        if (val === undefined) return '<span style="color: var(--text-secondary); font-style: italic;">undefined</span>';
        if (val === null) return '<span style="color: var(--text-secondary); font-style: italic;">null</span>';
        if (typeof val === 'string') return `"<span style="color: var(--color-success);">${escapeHtml(val)}</span>"`;
        if (typeof val === 'number') return `<span style="color: var(--color-info);">${val}</span>`;
        if (typeof val === 'boolean') return `<span style="color: var(--color-warning);">${val}</span>`;
        if (typeof val === 'object') {
            try {
                return `<span style="color: var(--text-secondary);">${escapeHtml(JSON.stringify(val, null, 2))}</span>`;
            } catch (e) {
                return `<span style="color: var(--text-secondary);">[Object]</span>`;
            }
        }
        return escapeHtml(String(val));
    };

    let html = '<div style="padding: 1rem;">';
    html += '<div style="margin-bottom: 1rem;">';
    html += '<div style="font-size: 0.9em; color: var(--text-secondary); margin-bottom: 0.5rem;">';
    html += 'This tab shows state mutations made by each middleware handler during request processing.';
    html += '</div>';
    html += '</div>';

    html += '<div style="display: flex; flex-direction: column; gap: 12px;">';

    request.handlerStack.forEach((item, index) => {
        const duration = item.duration > 0 ? item.duration : 0.01;
        const percent = Math.min(100, Math.max(1, (duration / totalDuration) * 100));
        const isSlow = percent > 15;
        const hasStateChanges = item.stateChanges && Object.keys(item.stateChanges).length > 0;

        const detailsId = `middleware-${index}`;

        html += `
        <details ${hasStateChanges ? 'open' : ''} id="${detailsId}" style="border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; background: var(--bg-primary);">
            <summary style="padding: 12px; cursor: pointer; background: var(--bg-secondary); border-left: 3px solid ${hasStateChanges ? 'var(--primary-color, #3b82f6)' : 'var(--border-color)'}; display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    <div style="font-weight: 500; margin-bottom: 4px;">
                        ${hasStateChanges ? '🔹 ' : '⚪ '}${escapeHtml(item.name)}
                    </div>
                    <div style="font-size: 0.85em; color: var(--text-secondary); font-family: monospace;">
                        ${escapeHtml(item.file)}:${item.line}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-family: monospace; font-size: 0.9em; color: ${isSlow ? 'var(--color-warning)' : 'var(--text-secondary)'};">
                        ${printDuration(duration)}
                    </div>
                    ${hasStateChanges ? `<div style="font-size: 0.8em; color: var(--primary-color, #3b82f6); margin-top: 2px;">${Object.keys(item.stateChanges).length} change${Object.keys(item.stateChanges).length === 1 ? '' : 's'}</div>` : '<div style="font-size: 0.8em; color: var(--text-secondary); margin-top: 2px;">No changes</div>'}
                </div>
            </summary>
            
            <div style="padding: 12px; border-top: 1px solid var(--border-color);">`;

        if (hasStateChanges) {
            html += '<div style="margin-bottom: 8px; font-weight: 500; color: var(--text-primary);">State Changes:</div>';
            html += '<table style="width: 100%; border-collapse: collapse; font-size: 0.9em; font-family: monospace;">';

            Object.entries(item.stateChanges).forEach(([key, value]) => {
                html += `
                <tr style="border-bottom: 1px solid var(--border-color-dim, #33333333);">
                    <td style="padding: 6px 8px; color: var(--text-flavor); font-weight: 500; vertical-align: top; width: 30%;">
                        ${escapeHtml(key)}
                    </td>
                    <td style="padding: 6px 8px; color: var(--text-secondary); vertical-align: top; width: 10%; text-align: center;">
                        →
                    </td>
                    <td style="padding: 6px 8px; word-break: break-all; vertical-align: top;">
                        ${formatValue(value)}
                    </td>
                </tr>
                `;
            });

            html += '</table>';
        } else {
            html += '<div style="color: var(--text-secondary); font-style: italic; text-align: center; padding: 1rem;">';
            html += 'This middleware did not modify ctx.state';
            html += '</div>';
        }

        html += '<div style="margin-top: 12px;">';
        html += '<div style="font-size: 0.8em; color: var(--text-secondary); margin-bottom: 4px;">Execution Time</div>';
        html += '<div style="height: 6px; background: var(--bg-secondary); border-radius: 3px; overflow: hidden;">';
        html += `<div style="height: 100%; width: ${percent}%; background: ${isSlow ? 'var(--color-warning)' : 'var(--color-success)'}; transition: width 0.3s ease;"></div>`;
        html += '</div>';
        html += '</div>';

        html += '</div>';
        html += '</details>';
    });

    html += '</div>';
    html += '</div>';

    return html;
}

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
    if (contentType.includes('javascript')) return 'javascript';
    if (contentType.includes('css')) return 'css';
    if (contentType.includes('image/png')) return 'png';
    if (contentType.includes('image/jpeg')) return 'jpeg';
    if (contentType.includes('image/gif')) return 'gif';
    if (contentType.includes('image/svg+xml')) return 'svg';
    if (contentType.includes('application/pdf')) return 'pdf';
    if (contentType.includes('application/zip')) return 'zip';
    if (contentType.includes('application/octet-stream')) return 'bin';
    return 'txt';
}

function getContentType(headers) {
    if (!headers) return '';
    const output = headers['content-type'] || headers['Content-Type'] || '';
    return output.toLowerCase();
}

function getBodyContent(body) {
    let value = body || '';
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

function initRequestEditor(request) {
    const el = document.getElementById('request-body-editor');
    if (!el) return;

    let content = request.requestBody || '';
    const contentType = getContentType(request.requestHeaders);
    let language = getExtension(contentType);

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

    // Handle binary
    if (content === '[Binary or Unreadable Body]') {
        el.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);">Binary Content</div>';
        return;
    }

    renderMonacoEditor(el, content, language, false);

    const btnCopy = document.getElementById('btn-copy-req-body');
    if (btnCopy) btnCopy.onclick = () => copyToClipboard(getBodyContent(request.requestBody));
}

function initResponseEditor(request) {
    const el = document.getElementById('response-body-editor');
    if (!el) return;

    let content = request.body || request.responseBody; // fallback to responseBody property if mapped
    if (!content) content = '';

    const contentType = getContentType(request.responseHeaders);
    let language = getExtension(contentType);

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

    // Handle binary
    if (content === '[Binary or Unreadable Body]') {
        el.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);">Binary Content</div>';
        // Ensure download button works
        const btnDownload = document.getElementById('btn-download-body');
        // We can't easily download the *actual* binary if we didn't store it.
        // But if we have it in memory or if backend serving it via separate endpoint...
        // For now, download the text placeholder is all we can do unless we fetch raw.
        if (btnDownload) btnDownload.onclick = () => alert("Original binary content not stored in dashboard history.");
        return;
    }

    renderMonacoEditor(el, content, language, window.autoFormatEnabled !== false);

    // Attach button listeners
    const btnCopy = document.getElementById('btn-copy-body');
    const btnDownload = document.getElementById('btn-download-body');
    if (btnCopy) btnCopy.onclick = () => copyToClipboard(getBodyContent(content));
    // TODO: replace with filename
    if (btnDownload) btnDownload.onclick = () => downloadString(getBodyContent(content), `body-${request.timestamp}.${getExtension(request.contentType)}`);
}

function renderMonacoEditor(containerElement, value, language, shouldFormat = false) {
    if (!window.monaco) {
        require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
        require(['vs/editor/editor.main'], function () { renderMonacoEditor(containerElement, value, language, shouldFormat); });
        return;
    }

    console.log({ language });
    window.currentEditor?.dispose();
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



// --- Replay Modal Implementation ---

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

let currentReplayState = {
    method: 'GET',
    url: '',
    headers: [],
    body: '',
    activeTab: 'body'
};

function openReplayModal(request) {
    injectReplayStyles();

    // Initialize State
    currentReplayState = {
        method: request.method || 'GET',
        url: request.url || '',
        headers: Object.entries(request.requestHeaders || {}).map(([k, v]) => ({ key: k, value: v })),
        body: typeof (request.requestBody) === 'string' ? request.requestBody : (request.requestBody ? JSON.stringify(request.requestBody || {}, null, 2) : ''),
        direction: request.direction || 'outbound',
        activeTab: 'body',
        response: null
    };

    renderReplayModal();
}

function closeReplayModal() {
    const el = document.getElementById('replay-modal-overlay');
    if (el) el.remove();
}

function renderReplayModal() {
    let el = document.getElementById('replay-modal-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'replay-modal-overlay';
        document.body.appendChild(el);

        // Close on backdrop click
        el.addEventListener('click', (e) => {
            if (e.target === el) closeReplayModal();
        });
    }

    const { method, url, headers, body, activeTab, response } = currentReplayState;
    const isResponse = activeTab === 'response';

    const tabs = ['body', 'headers', 'params', 'response'];

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
                    <button class="replay-btn btn-secondary" onclick="copyReplayCurl()">
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
                <input class="replay-input" value="${escapeHtml(url)}" oninput="updateReplayState('url', this.value)" placeholder="https://api.example.com/v1/...">
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
                    <textarea class="code-editor" spellcheck="false" oninput="updateReplayState('body', this.value)">${escapeHtml(body)}</textarea>
                ` : ''}
                
                ${activeTab === 'headers' ? `
                    <div id="replay-headers-list">
                        ${headers.map((h, i) => `
                            <div class="kv-editor-row">
                                <input class="kv-key" value="${escapeHtml(h.key)}" oninput="updateReplayHeader(${i}, 'key', this.value)" placeholder="Key">
                                <input class="kv-val" value="${escapeHtml(h.value)}" oninput="updateReplayHeader(${i}, 'value', this.value)" placeholder="Value">
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
            if (el) {
                let content = response.body || '';
                if (typeof content === 'object') content = JSON.stringify(content, null, 2);

                let lang = 'json'; // default
                // try to sniff
                if (typeof content === 'string' && !content.trim().startsWith('{') && !content.trim().startsWith('[')) {
                    lang = 'plaintext';
                }

                renderMonacoEditor(el, content, lang, true);
            }
        }, 0);
    }
}

function renderReplayResponsePlaceholder(response) {
    if (!response) return `<div style="color: var(--text-secondary); text-align: center; margin-top: 2rem;">No response yet. Click Send to replay.</div>`;

    let colorClass = response.status >= 500 ? 'status-5xx' : response.status >= 400 ? 'status-4xx' : 'status-2xx';

    return `
        <div style="margin-bottom: 1rem; display: flex; gap: 1rem; align-items: center;">
            <span class="response-status-badge ${colorClass}">${response.status} ${response.statusText || ''}</span>
            <span style="color: var(--text-secondary)">${formatBytes(response.size || 0)}</span>
            <span style="color: var(--text-secondary)">${response.duration || 0}ms</span>
            <div style="flex:1"></div>
            <button class="replay-btn btn-secondary" onclick="copyToClipboard(currentReplayState.responseBodyStr)">Copy</button>
        </div>
        <div style="border: 1px solid var(--border-color); border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; height: calc(100% - 40px)">
             <div id="replay-response-editor" style="flex: 1;"></div>
        </div>
    `;
}

function updateReplayState(key, value) {
    currentReplayState[key] = value;
    if (key === 'activeTab') renderReplayModal(); // Re-render for tab switch
}

function updateReplayHeader(index, field, value) {
    currentReplayState.headers[index][field] = value;
}

function addReplayHeader() {
    currentReplayState.headers.push({ key: '', value: '' });
    renderReplayModal();
}

function removeReplayHeader(index) {
    currentReplayState.headers.splice(index, 1);
    renderReplayModal();
}

function executeReplay() {
    const { method, url, headers, body, direction } = currentReplayState;

    // Construct headers object
    const headersObj = {};
    headers.forEach(h => {
        if (h.key) headersObj[h.key] = h.value;
    });

    // Parse body if JSON
    let bodyData = body;
    try {
        bodyData = JSON.parse(body);
    } catch (e) {
        // Keep as string
    }

    // Using dashboard replay endpoint
    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname.slice(0, -1) : window.location.pathname;

    // Show loading?
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

                currentReplayState.response = {
                    status: result.status,
                    headers: result.headers,
                    body: result.data,
                    duration: result.duration,
                    size: bodyStr ? bodyStr.length : 0
                };
                currentReplayState.responseBodyStr = bodyStr; // Store for copy
                currentReplayState.activeTab = 'response';
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
}

function copyReplayCurl() {
    // Generate Curl
    const { method, url, headers, body } = currentReplayState;
    let cmd = `curl -X ${method} "${url}"`;
    headers.forEach(h => {
        if (h.key) cmd += ` \\\n  -H "${h.key}: ${h.value}"`;
    });
    if (body) {
        // Escape body for shell
        const escaped = body.replace(/"/g, '\\"');
        cmd += ` \\\n  -d "${escaped}"`;
    }

    copyToClipboard(cmd);
}

function handleReplayImport(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            // Try to map HAR or simple JSON
            if (data.log && data.log.entries) {
                // HAR
                const entry = data.log.entries[0];
                if (entry && entry.request) {
                    currentReplayState.method = entry.request.method;
                    currentReplayState.url = entry.request.url;
                    currentReplayState.headers = entry.request.headers.map(h => ({ key: h.name, value: h.value }));
                    if (entry.request.postData && entry.request.postData.text) {
                        currentReplayState.body = entry.request.postData.text;
                    }
                }
            } else {
                // Simple format
                currentReplayState.method = data.method || 'GET';
                currentReplayState.url = data.url || '';
                if (data.headers) {
                    if (Array.isArray(data.headers)) currentReplayState.headers = data.headers;
                    else currentReplayState.headers = Object.entries(data.headers).map(([k, v]) => ({ key: k, value: v }));
                }
                if (data.body) {
                    currentReplayState.body = typeof data.body === 'string' ? data.body : JSON.stringify(data.body, null, 2);
                }
            }
            renderReplayModal();
        } catch (err) {
            alert("Failed to parse file: " + err.message);
        }
    };
    reader.readAsText(file);
    input.value = ''; // Reset
}
