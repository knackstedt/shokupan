
// ============================================================================
// TIMELINE TAB & VISUALIZATION
// ============================================================================

window.renderTimelineTab = function (request) {
    return `
        <div style="display: flex; flex-direction: column; height: 100%; gap: 1rem; padding: 1rem;">
            <!-- Visualization Section -->
            <div style="background: var(--bg-primary); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color);">
                <div style="font-weight: 500; margin-bottom: 0.5rem; display: flex; justify-content: space-between;">
                   <span>Event Timeline</span>
                   <span style="font-size: 0.85em; color: var(--text-secondary);">${request.wsMessages ? request.wsMessages.length : 0} events</span>
                </div>
                <div id="timeline-viz" style="height: 100px; width: 100%; position: relative; background: var(--bg-secondary); border-radius: 4px; overflow: hidden;">
                     <!-- Visualization will be injected here -->
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.8em; color: var(--text-secondary); margin-top: 4px;">
                    <span>0ms</span>
                    <span>${window.formatDurationPretty ? window.formatDurationPretty(request.duration || 0) : (request.duration || 0) + 'ms'}</span>
                </div>
            </div>

            <!-- Events Table Section -->
            <div style="flex: 1; display: flex; flex-direction: column; min-height: 300px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                <div style="padding: 8px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 500; margin-left: 8px;">Events</span>
                    <div style="display: flex; gap: 8px;">
                         <button id="btn-export-timeline" style="padding: 4px 12px; font-size: 0.85em; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); cursor: pointer;">
                            Export JSON
                         </button>
                    </div>
                </div>
                <div id="timeline-table" style="flex: 1; width: 100%;"></div>
            </div>
        </div>
    `;
};

window.initTimeline = function (request) {
    if (!request.wsMessages || request.wsMessages.length === 0) {
        const viz = document.getElementById('timeline-viz');
        if (viz) viz.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);">No events recorded</div>';
        return;
    }

    // 1. Render Visualization
    renderTimelineViz(request);

    // 2. Initialize Tabulator
    if (!window.Tabulator) {
        console.error("Tabulator not loaded");
        return;
    }

    const messages = request.wsMessages.map((m, idx) => ({
        id: idx,
        timestamp: m.timestamp,
        offset: m.timestamp - request.timestamp,
        type: m.type,
        dir: m.dir,
        size: m.size,
        data: m.data || (m.size > 0 ? '[Binary/Hidden]' : ''),
    }));

    // Use global formatBytes if available, or local
    const fmtBytes = window.formatBytes || ((b) => b + ' B');

    window.timelineTable = new Tabulator("#timeline-table", {
        data: messages,
        layout: "fitColumns",
        height: "100%",
        columns: [
            { title: "Time", field: "offset", width: 90, formatter: (cell) => `+${Math.round(cell.getValue())}ms` },
            {
                title: "Dir", field: "dir", width: 70, hozAlign: "center", formatter: (cell) => {
                    const val = cell.getValue();
                    const color = val === 'out' ? '#10b981' : '#3b82f6';
                    const icon = val === 'out' ? '⬆' : '⬇';
                    return `<span style="color: ${color}; font-weight: bold;">${icon} ${val.toUpperCase()}</span>`;
                }
            },
            { title: "Type", field: "type", width: 100 },
            { title: "Size", field: "size", width: 100, formatter: (cell) => fmtBytes(cell.getValue()) },
            { title: "Data", field: "data", formatter: "textarea" },
            {
                title: "Actions", width: 100, hozAlign: "center", formatter: (cell) => {
                    const rowData = cell.getRow().getData();
                    if (rowData.dir === 'in' && rowData.type === 'message') {
                        // Replay button (Client -> Server)
                        return `<button class="replay-btn" style="padding: 2px 8px; font-size: 0.8em; cursor: pointer;">Replay</button>`;
                    }
                    return '';
                }, cellClick: (e, cell) => {
                    if (e.target.classList.contains('replay-btn')) {
                        if (window.handleReplay) window.handleReplay(request, cell.getRow().getData());
                        else console.warn("handleReplay not found");
                    }
                }
            }
        ]
    });

    // 3. Attach Export Handler
    const btnExport = document.getElementById('btn-export-timeline');
    if (btnExport) {
        btnExport.onclick = () => {
            const exportData = {
                url: request.url,
                timestamp: request.timestamp,
                events: request.wsMessages
            };
            if (window.downloadString) window.downloadString(JSON.stringify(exportData, null, 2), `ws-timeline-${request.timestamp}.json`);
        };
    }
};

window.updateTimeline = function (request) {
    // 1. Re-render Viz
    renderTimelineViz(request);

    // 2. Update Table
    if (window.timelineTable) {
        const messages = request.wsMessages.map((m, idx) => ({
            id: idx,
            timestamp: m.timestamp,
            offset: m.timestamp - request.timestamp,
            type: m.type,
            dir: m.dir,
            size: m.size,
            data: m.data || (m.size > 0 ? '[Binary/Hidden]' : ''),
        }));

        // updateOrAddData is smoother than replaceData if IDs match
        window.timelineTable.updateOrAddData(messages);
    } else {
        // Fallback if table not initialized
        window.initTimeline(request);
    }
};

function renderTimelineViz(request) {
    const container = document.getElementById('timeline-viz');
    if (!container) return;

    const messages = request.wsMessages;
    if (!messages.length) return;

    const start = request.timestamp;
    let end = start + (request.duration || 0);
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.timestamp > end) end = lastMsg.timestamp;
    if (end <= start) end = start + 1000;

    const duration = end - start;
    let html = '';

    // Center line
    html += `<div style="position: absolute; top: 50%; left: 0; width: 100%; height: 2px; background: #e5e7eb; transform: translateY(-50%);"></div>`;

    const fmtBytes = window.formatBytes || ((b) => b + ' B');

    messages.forEach(msg => {
        const offset = msg.timestamp - start;
        const pct = Math.max(0, Math.min(100, (offset / duration) * 100));

        let color = '#6b7280';
        let height = 10;
        let width = 2;

        if (msg.type === 'open') {
            color = '#10b981';
            width = 8;
            height = 8;
            html += `<div style="position: absolute; left: ${pct}%; top: 50%; width: 8px; height: 8px; border-radius: 50%; background: ${color}; transform: translate(-50%, -50%); z-index: 2;" title="Open: +${Math.round(offset)}ms"></div>`;
            return;
        }
        if (msg.type === 'close') {
            color = '#ef4444';
            width = 8;
            height = 8;
            html += `<div style="position: absolute; left: ${pct}%; top: 50%; width: 8px; height: 8px; border-radius: 50%; background: ${color}; transform: translate(-50%, -50%); z-index: 2;" title="Close: +${Math.round(offset)}ms"></div>`;
            return;
        }

        if (msg.type === 'message') {
            const isOut = msg.dir === 'out';
            color = isOut ? '#10b981' : '#3b82f6';
            height = 20;
            width = 3;

            if (isOut) {
                html += `<div style="position: absolute; left: ${pct}%; bottom: calc(50% + 2px); width: ${width}px; height: ${height}px; background: ${color}; border-radius: 2px; transform: translateX(-50%); opacity: 0.8;" title="Send: ${fmtBytes(msg.size)}"></div>`;
            } else {
                html += `<div style="position: absolute; left: ${pct}%; top: calc(50% + 2px); width: ${width}px; height: ${height}px; background: ${color}; border-radius: 2px; transform: translateX(-50%); opacity: 0.8;" title="Recv: ${fmtBytes(msg.size)}"></div>`;
            }
        }
    });

    container.innerHTML = html;
}
