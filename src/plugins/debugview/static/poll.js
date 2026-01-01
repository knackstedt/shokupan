
async function updateDashboard() {
    try {
        const headers = getRequestHeaders ? getRequestHeaders() : {};
        // Handle relative path issue when accessing /admin without trailing slash
        const metricsUrl = window.location.pathname.endsWith('/') ? 'metrics' : window.location.pathname + '/metrics';
        const res = await fetch(metricsUrl, { headers });
        if (!res.ok) return;

        const data = await res.json();
        const metrics = data.metrics;
        window.metrics = metrics; // Update global metrics for tooltips

        // Refresh Registry if active
        if (document.getElementById('tab-registry').classList.contains('active')) {
            const registryContainer = document.getElementById('registry-tree');
            // Simple clear and re-render (optimization: could just update tooltips)
            registryContainer.innerHTML = '';
            renderRegistry(registryData, registryContainer);
        }

        document.getElementById('uptime').innerText = data.uptime;
        document.getElementById('total-requests').innerText = metrics.totalRequests;
        document.getElementById('active-requests').innerText = metrics.activeRequests;
        document.getElementById('successful-requests').innerText = metrics.successfulRequests;
        document.getElementById('failed-requests').innerText = metrics.failedRequests;
        document.getElementById('avg-latency').innerText = metrics.averageTotalTime_ms.toFixed(2);

        // Recalc rates
        const finishedRequests = metrics.totalRequests - metrics.activeRequests;
        const successRate = finishedRequests ? Math.round((metrics.successfulRequests / finishedRequests) * 100) : 100;
        const failRate = finishedRequests ? Math.round((metrics.failedRequests / finishedRequests) * 100) : 0;

        document.getElementById('success-rate').innerText = successRate + '%';
        document.getElementById('fail-rate').innerText = failRate + '%';

        // --- Update Chart ---
        // We'll limit to last 50 points
        const recentLogs = metrics.logs.slice(-50);
        const labels = recentLogs.map(log => new Date(log.timestamp).toLocaleTimeString());
        const points = recentLogs.map(log => log.duration);

        latencyChart.data.labels = labels;
        latencyChart.data.datasets[0].data = points;
        latencyChart.update();

        // --- Update Table ---
        // Tabulator replaceData method efficiently updates the table
        table.replaceData(metrics.logs);

    } catch (err) {
        console.error("Failed to update dashboard", err);
    }
}

// Auto-refresh every 2 seconds
setInterval(updateDashboard, 2000);
// Initial load
updateDashboard();

// --- Tabs Logic ---
function switchTab(tabId) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    // Find the button that was clicked
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick') === `switchTab('${tabId}')`);
    if (btn) btn.classList.add('active');

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');

    if (tabId === 'graph') {
        initGraph();
    }
}

