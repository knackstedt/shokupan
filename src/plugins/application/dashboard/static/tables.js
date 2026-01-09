
// --- Table Config Helper ---
function createTable(id, columns, placeholder = "No data available") {
    return new Tabulator(id, {
        layout: "fitColumns",
        height: "300px",
        placeholder: placeholder,
        data: [],
        columns: columns,
        layoutColumnsOnNewData: true,
    });
}

// --- Top Requests Table ---
const topRequestsTable = createTable("#top-requests-table", [
    { title: "Count", field: "count", align: "center", width: 100, sorter: "number" },
    { title: "Method", field: "method", width: 110 },
    { title: "URL", field: "url" },
]);

// --- Top Errors Table ---
const topErrorsTable = createTable("#top-errors-table", [
    { title: "Count", field: "count", align: "center", width: 100, sorter: "number" },
    { title: "Error Message", field: "error" },
]);

// --- Failing Requests Table ---
const failingRequestsTable = createTable("#failing-requests-table", [
    { title: "Failures", field: "count", align: "center", width: 80, sorter: "number" },
    { title: "Method", field: "method", width: 110 },
    { title: "URL", field: "url" },
]);

// --- Slowest Requests Table ---
const slowestRequestsTable = createTable("#slowest-requests-table", [
    { title: "Duration (ms)", field: "duration", width: 130, sorter: "number", formatter: (cell) => printDuration(cell.getValue()) },
    {
        title: "URL", formatter: (cell) => {
            const data = cell.getData() ?? {};
            return data.method?.toUpperCase() + ": " + data.url;
        }
    },
    {
        title: "Status", field: "status", width: 100, align: "center", formatter: function (cell) {
            const val = cell.getValue();
            return `<span style="color: ${val >= 400 ? 'red' : 'green'}">${val}</span>`;
        }
    },
    { title: "Time", field: "timestamp", width: 150, formatter: (cell) => new Date(cell.getValue()).toLocaleTimeString() }
]);


async function fetchTopStats() {
    // Get request headers from global function if available
    const headers = typeof getRequestHeaders !== 'undefined' ? getRequestHeaders() : {};

    // Determine base path for API requests  
    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname.slice(0, -1) : window.location.pathname;
    const url = basePath + '/';
    const interval = document.getElementById('time-range-selector')?.value || '1m';
    try {
        // Top Requests
        fetch(url + 'requests/top?interval=' + interval, { headers }).then(r => r.json()).then(d => {
            if (d.top) topRequestsTable.setData(d.top);
        });

        // Top Errors
        fetch(url + 'errors/top?interval=' + interval, { headers }).then(r => r.json()).then(d => {
            if (d.top) topErrorsTable.setData(d.top);
        });

        // Failing Requests
        fetch(url + 'requests/failing?interval=' + interval, { headers }).then(r => r.json()).then(d => {
            if (d.top) failingRequestsTable.setData(d.top);
        });

        // Slowest Requests
        fetch(url + 'requests/slowest?interval=' + interval, { headers }).then(r => r.json()).then(d => {
            if (d.slowest) slowestRequestsTable.setData(d.slowest);
        });

    } catch (e) {
        console.error("Failed to fetch top stats", e);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    fetchTopStats();
    // Refresh periodically
    setInterval(fetchTopStats, 10000);
});

