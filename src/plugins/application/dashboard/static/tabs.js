// --- Tabs Logic ---
function switchTab(tabId) {
    console.log('Switching to tab:', tabId);
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    // Find the button that was clicked
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick') === `switchTab('${tabId}')`);
    if (btn) btn.classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');

    if (tabId === 'overview') {
        if (typeof fetchTopStats === 'function') fetchTopStats();
    }
    else if (tabId === 'graph') {
        initGraph();
    }
    else if (tabId === 'requests') {
        if (typeof fetchRequests === 'function') fetchRequests();
    }
    else if (tabId === 'failures') {
        fetchFailures();
    }
    else if (tabId === 'middleware') {
        fetchMiddleware();
    }
    else if (tabId === 'registry') {
        if (typeof fetchRegistry === 'function') fetchRegistry();
    }
}

// Middleware fetch function
async function fetchMiddleware() {
    try {
        const headers = getRequestHeaders ? getRequestHeaders() : {};
        const basePath = window.location.pathname.endsWith('/') ? '' : window.location.pathname;
        const url = basePath + (basePath.endsWith('/') ? 'middleware' : '/middleware');

        const res = await fetch(url, { headers });
        if (!res.ok) return;
        const data = await res.json();

        // Initialize or update table
        if (!window.middlewareTable) {
            window.middlewareTable = new Tabulator("#middleware-table-container", {
                layout: "fitColumns",
                height: "500px",
                placeholder: "No middleware executions tracked",
                data: data.middleware || [],
                columns: [
                    {
                        title: "Timestamp", field: "timestamp", width: 180, formatter: function (cell) {
                            return new Date(cell.getValue()).toLocaleString();
                        }
                    },
                    {
                        title: "Name", field: "name", width: 200,
                        formatter: function (cell) {
                            const row = cell.getRow().getData();
                            const isBuiltin = row.metadata?.isBuiltin;
                            const pluginName = row.metadata?.pluginName;
                            let badge = '';
                            if (isBuiltin) {
                                badge = ' <span style="background: #059669; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7em;">BUILTIN</span>';
                            }
                            const plugin = pluginName ? ` <span style="color: #6ee7b7;">[${pluginName}]</span>` : '';
                            return cell.getValue() + badge + plugin;
                        }
                    },
                    { title: "Path", field: "path", headerFilter: "input" },
                    {
                        title: "Duration (ms)", field: "duration", width: 120,
                        formatter: (cell) => cell.getValue() ? cell.getValue().toFixed(2) : 'N/A'
                    },
                    {
                        title: "Status", field: "error", width: 100, formatter: function (cell) {
                            const error = cell.getValue();
                            if (error) {
                                return '<span style="color: #ef4444; font-weight: bold;">ERROR</span>';
                            }
                            return '<span style="color: #22c55e; font-weight: bold;">OK</span>';
                        }
                    }
                ],
                initialSort: [
                    { column: "timestamp", dir: "desc" }
                ]
            });
        } else {
            window.middlewareTable.replaceData(data.middleware || []);
        }
    } catch (e) {
        console.error("Failed to fetch middleware", e);
    }
}

async function fetchFailures() {
    try {
        const headers = getRequestHeaders ? getRequestHeaders() : {};
        // Handle relative path issue
        const basePath = window.location.pathname.endsWith('/') ? '' : window.location.pathname;
        const url = basePath + (basePath.endsWith('/') ? 'failures' : '/failures');

        const res = await fetch(url, { headers });
        if (!res.ok) return;
        const data = await res.json();
        failuresTable.replaceData(data.failures);
    } catch (e) {
        console.error("Failed to fetch failures", e);
    }
}