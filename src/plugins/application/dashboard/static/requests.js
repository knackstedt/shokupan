
// Initialize Requests Table
window.requestsTable = null;

// Filter State
// Initialize Filter State
let filterText = '';
let filterType = 'all';
let filterDirection = 'all';

// Waterfall State
let minRequestTime = Infinity;
let maxRequestTime = 0;

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
                        <span style="color: var(--text-secondary);">${name}</span>
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
                if (row.protocol && row.protocol !== 'http' && row.protocol !== 'https') return row.protocol;
                return row.scheme || row.protocol || '-';
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
                return r.contentType || 'document';
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
            headerSort: false,
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
                    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname.slice(0, -1) : window.location.pathname;

                    // Determine direction if not explicit
                    const direction = data.direction || 'inbound';

                    fetch(basePath + '/replay', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            method: data.method,
                            url: data.url,
                            headers: data.requestHeaders,
                            body: data.requestBody,
                            direction: direction
                        })
                    })
                        .then(res => res.json())
                        .then(result => {
                            if (result.error) {
                                alert('Replay Failed: ' + result.error);
                            } else {
                                // Show result in a simplified details view or just alert success?
                                // User requirement: "presents the response data to the user"
                                // Let's create a temporary object mimicking a request log and show it in details view
                                const replayLog = {
                                    ...data,
                                    id: 'replay-' + Date.now(),
                                    status: result.status,
                                    duration: result.duration || 0,
                                    timestamp: Date.now(),
                                    responseHeaders: result.headers,
                                    responseBody: result.data,
                                    size: result.data ? result.data.length : 0
                                };
                                showRequestDetails(replayLog);
                            }
                        })
                        .catch(err => console.error("Replay fetch failed", err));
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
            right: min(${startPct}%, calc(100% - 2px));
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
    if (!window.requestsTable || !newRequests || !newRequests.length) return;

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
        case 'security':
            return renderSecurityTab(request);
        default:
            return '';
    }
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
                        <td style="padding: 4px 8px; font-weight: 500;">${c.name}</td>
                        <td style="padding: 4px 8px; word-break: break-all;">${c.value}</td>
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
                <td style="font-weight: 500; color: var(--text-flavor); padding: 4px 8px; vertical-align: top;">${k}:</td>
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
                     <div style="color: var(--text-flavor);">Request URL:</div><div style="word-break: break-all;">${request.url}</div>
                     <div style="color: var(--text-flavor);">Request Method:</div><div>${request.method}</div>
                     <div style="color: var(--text-flavor);">Status Code:</div><div>${request.status}</div>
                     <div style="color: var(--text-flavor);">Remote Address:</div><div>${request.remoteIP || '-'}</div>
                     <div style="color: var(--text-flavor);">Referrer Policy:</div><div>${request.requestHeaders?.['referrer-policy'] || 'strict-origin-when-cross-origin'}</div>
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


