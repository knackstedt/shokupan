
// --- Failures Tab Logic ---
const failuresTable = new Tabulator("#failures-table-container", {
    layout: "fitColumns",
    height: "500px",
    placeholder: "No failed requests found",
    data: [],
    columns: [
        { title: "Time", field: "timestamp", width: 180, formatter: (cell) => new Date(cell.getValue()).toLocaleString() },
        { title: "Method", field: "method", width: 100 },
        { title: "URL", field: "url" },
        { title: "Status", field: "status", width: 90, formatter: (cell) => `<span style="color: #ef4444; font-weight: bold;">${cell.getValue()}</span>` },
        {
            title: "Actions", formatter: (cell) => {
                return `
                        <button class="replay-btn" style="background:#3b82f6; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:4px;">Replay</button>
                        <button class="export-btn" style="background:#64748b; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Export</button>
                    `;
            }, cellClick: (e, cell) => {
                if (e.target.classList.contains('replay-btn')) {
                    replayRequest(cell.getRow().getData());
                } else if (e.target.classList.contains('export-btn')) {
                    exportFailure(cell.getRow().getData());
                }
            }, width: 140, headerSort: false
        }
    ]
});


function exportFailure(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `failure-${data.timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importFailure() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const data = JSON.parse(ev.target.result);
                replayRequest(data);
            } catch (err) { alert("Invalid JSON: " + err); }
        };
        reader.readAsText(file);
    };
    input.click();
}

async function replayRequest(req) {
    if (!confirm(`Replay ${req.method} ${req.url}?`)) return;

    try {
        const headers = getRequestHeaders ? getRequestHeaders() : {};
        const basePath = window.location.pathname.endsWith('/') ? '' : window.location.pathname;
        const url = basePath + (basePath.endsWith('/') ? 'replay' : '/replay');

        const res = await fetch(url, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: req.body
            })
        });

        const result = await res.json();
        alert(`Replay Status: ${res.status}\n\nResponse:\n${JSON.stringify(result, null, 2)}`);
    } catch (e) {
        alert("Replay Failed: " + e);
    }
}

