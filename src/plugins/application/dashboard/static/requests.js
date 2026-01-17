
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
            { title: "Duration (ms)", field: "duration", width: 150, formatter: (cell) => printDuration(cell.getValue()) },
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
    const headers = typeof getRequestHeaders !== 'undefined' ? getRequestHeaders() : {};

    // Determine base path for API requests  
    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname.slice(0, -1) : window.location.pathname;
    const url = basePath + '/';

    fetch(url + 'requests', { headers })
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
            <div><strong>Duration:</strong> ${printDuration(request.duration)} ms</div>
            <div><strong>Timestamp:</strong> ${new Date(request.timestamp).toLocaleString()}</div>
        </div>
    `;

    // Render Trace
    if (request.handlerStack && request.handlerStack.length > 0) {
        const totalDuration = request.duration || 1; // avoid divide by zero
        let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';

        request.handlerStack.forEach((item, index) => {
            const duration = item.duration > 0 ? item.duration : 0.01;
            const percent = Math.min(100, Math.max(1, (duration / totalDuration) * 100));
            const isSlow = percent > 15; // Highlight if takes > 15% of total time

            html += `
                <div style="
                    padding: 12px; 
                    border-radius: 6px; 
                    background: var(--bg-secondary); 
                    border-left: 4px solid ${isSlow ? 'var(--color-warning)' : 'var(--color-success)'};
                    position: relative;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-weight: 600; font-size: 1rem;">${item.name}</span>
                            ${item.isBuiltin ? '<span style="font-size: 0.7rem; background: var(--bg-primary); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-color);">Built-in</span>' : ''}
                        </div>
                        <span style="font-family: monospace; font-weight: bold; ${isSlow ? 'color: var(--color-warning);' : ''}">${printDuration(duration)}</span>
                    </div>
                    
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px; font-family: monospace;">
                        ${item.file}:${item.line}
                    </div>

                    <!-- Duration Bar -->
                    <div style="
                        height: 4px; 
                        background: var(--bg-primary); 
                        border-radius: 2px; 
                        overflow: hidden; 
                        width: 100%;
                    ">
                        <div style="
                            height: 100%; 
                            width: ${percent}%; 
                            background: ${isSlow ? 'var(--color-warning)' : 'var(--color-success)'};
                            opacity: 0.8;
                        "></div>
                    </div>
                </div>
            `;

            if (index < request.handlerStack.length - 1) {
                html += `
                    <div style="display: flex; justify-content: center; height: 16px; align-items: center;">
                        <div style="width: 2px; height: 100%; background: var(--border-color); opacity: 0.3;"></div>
                    </div>
                `;
            }
        });

        html += '</div>';
        traceContainer.innerHTML = html;
    } else {
        traceContainer.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: var(--text-secondary); background: var(--bg-secondary); border-radius: 8px; border: 1px dashed var(--border-color);">
                No middleware trace captured for this request.
            </div>
        `;
    }

    // Scroll to details
    container.scrollIntoView({ behavior: 'smooth' });
}

window.updateRequestsList = function (newRequests) {
    console.log('updateRequestsList called with', newRequests ? newRequests.length : 0, 'requests');
    if (!requestsTable || !newRequests || newRequests.length === 0) return;

    // Prepend new requests
    const currentData = requestsTable.getData();
    // Use a Set for existing IDs to avoid duplicates if any overlap occurs
    const existingIds = new Set(currentData.map(r => r.id));

    const uniqueNew = newRequests.filter(r => !existingIds.has(r.id));

    if (uniqueNew.length > 0) {
        // Add to top
        requestsTable.addData(uniqueNew, true);

        // Limit total rows to 100 to prevent performance issues
        const totalRows = requestsTable.getDataCount();
        if (totalRows > 100) {
            const rowsToDelete = requestsTable.getRows().slice(100);
            rowsToDelete.forEach(row => row.delete());
        }
    }
};
