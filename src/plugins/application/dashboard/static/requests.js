
// Initialize Requests Table
let requestsTable;

document.addEventListener('DOMContentLoaded', () => {
    requestsTable = new Tabulator("#requests-list-container", {
        layout: "fitColumns",
        placeholder: "No requests found",
        selectable: 1,
        columns: [
            { title: "Method", field: "method", width: 100 },
            { title: "URL", field: "url" },
            {
                title: "Status",
                field: "status",
                width: 100,
                formatter: function (cell) {
                    const status = cell.getValue();
                    const color = status >= 500 ? 'red' : status >= 400 ? 'orange' : 'green';
                    return `<span style="color: ${color}; font-weight: bold;">${status}</span>`;
                }
            },
            { title: "Duration (ms)", field: "duration", width: 150 },
            {
                title: "Time",
                field: "timestamp",
                width: 200,
                formatter: function (cell) {
                    return new Date(cell.getValue()).toLocaleString();
                }
            },
            {
                title: "",
                width: 80,
                formatter: function (cell) {
                    const el = document.createElement("div");
                    el.onclick = () => showRequestDetails(cell.getData());
                    el.innerHTML = "View";
                    return el;
                }
            }
        ],
        data: []
    });

    // Auto-fetch on load if tab is active (or just fetch initially)
    fetchRequests();
});

function fetchRequests() {

    const headers = getRequestHeaders ? getRequestHeaders() : {};
    const basePath = window.location.pathname.endsWith('/') ? '' : window.location.pathname;
    const url = basePath + (basePath.endsWith('/') ? 'requests' : '/requests');

    fetch(url, { headers })
        .then(res => res.json())
        .then(data => {
            if (requestsTable) {
                requestsTable.setData(data.requests);
            }
        })
        .catch(err => console.error("Failed to fetch requests", err));
}

function showRequestDetails(request) {
    const container = document.getElementById('request-details-container');
    const content = document.getElementById('request-details-content');
    const traceContainer = document.getElementById('middleware-trace-container');

    container.style.display = 'block';

    // Render Summary
    content.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
            <div><strong>Method:</strong> ${request.method}</div>
            <div><strong>URL:</strong> ${request.url}</div>
            <div><strong>Status:</strong> ${request.status}</div>
            <div><strong>Duration:</strong> ${request.duration?.toFixed(2)} ms</div>
            <div><strong>Timestamp:</strong> ${new Date(request.timestamp).toLocaleString()}</div>
        </div>
    `;

    // Render Trace
    if (request.handlerStack && request.handlerStack.length > 0) {
        let html = '<div style="display: flex; flex-direction: column; gap: 4px;">';

        request.handlerStack.forEach((item, index) => {
            const duration = item.duration || 0;

            if (index !== 0) {
                html += `<div style="align-self: center">⬇︎</div>`;
            }

            html += `
                <div style="padding: 8px; border-radius: 4px; background: var(--bg-secondary);">
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: bold;">${item.name}</span>
                        <span>${duration.toFixed(2)} ms</span>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">
                        ${item.file}:${item.line}
                    </div>
                    ${item.stateChanges ? `<div style="font-size: 0.8rem; margin-top: 4px; color: #aaa;">State Changes: ${Object.keys(item.stateChanges).join(', ')}</div>` : ''}
                </div>
            `;
        });

        html += '</div>';
        traceContainer.innerHTML = html;
    } else {
        traceContainer.innerHTML = '<div style="color: var(--text-secondary);">No middleware trace available.</div>';
    }

    // Scroll to details
    container.scrollIntoView({ behavior: 'smooth' });
}
