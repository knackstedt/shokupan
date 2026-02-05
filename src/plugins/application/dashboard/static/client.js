
(function () {
    let ws;
    let reconnectTimer;
    let initialConnection = true;

    function formatDuration(deltaMs) {
        if (deltaMs > (7 * 24 * 60 * 60 * 1000)) return (deltaMs / (7 * 24 * 60 * 60 * 1000)).toFixed(0) + " weeks";
        if (deltaMs > (24 * 60 * 60 * 1000)) return (deltaMs / (24 * 60 * 60 * 1000)).toFixed(0) + " days";
        if (deltaMs > (60 * 60 * 1000)) return (deltaMs / (60 * 60 * 1000)).toFixed(0) + " hours";
        if (deltaMs > 60 * 1000) return (deltaMs / (60 * 1000)).toFixed(0) + " minutes";
        if (deltaMs > 1000) return (deltaMs / 1000).toFixed(2) + " seconds";
        return deltaMs.toFixed(0) + " ms";
    }

    function updateDOM(data) {
        if (!data) return;
        const metrics = data.metrics;
        const uptime = data.uptime;

        if (metrics) {
            window.metrics = metrics; // Update global metrics for any other scripts using it

            setSafeText('total-requests', metrics.totalRequests);
            setSafeText('active-requests', metrics.activeRequests);
            setSafeText('successful-requests', metrics.successfulRequests);
            setSafeText('failed-requests', metrics.failedRequests);

            if (metrics.averageTotalTime_ms !== undefined) {
                setSafeText('avg-latency', metrics.averageTotalTime_ms.toFixed(2));
            }

            // Recalc rates
            const finishedRequests = metrics.totalRequests - metrics.activeRequests;
            const successRate = finishedRequests ? Math.round((metrics.successfulRequests / finishedRequests) * 100) : 100;
            const failRate = finishedRequests ? Math.round((metrics.failedRequests / finishedRequests) * 100) : 0;

            setSafeText('success-rate', successRate + '%');
            setSafeText('fail-rate', failRate + '%');
        }

        if (uptime) {
            setSafeText('uptime', uptime);
        }

        // Charts are now updated via specific 'metric-update' events or 'init' history
    }

    function setSafeText(id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    }

    function connect() {
        // Determine WS URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Handle relative path for dashboard mount
        // Use configured base path if available, otherwise fallback to location logic
        let path = (window.SHOKUPAN_CONFIG && window.SHOKUPAN_CONFIG.base) ? window.SHOKUPAN_CONFIG.base : window.location.pathname;
        if (!path.endsWith('/')) path += '/';

        const wsUrl = protocol + '//' + window.location.host + path + 'ws';

        console.log("Connecting to WebSocket:", wsUrl);
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log("Connected to Dashboard WebSocket");
            const statusEl = document.getElementById('ws-status');
            if (statusEl) {
                statusEl.style.background = '#10b981'; // green
                statusEl.title = 'WebSocket: Connected';
            }

            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            // Request initial data? The server sends it on open.
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'init') {
                    updateDOM(msg);
                    if (msg.history && window.initCharts) {
                        window.initCharts(msg.history);
                    }
                } else if (msg.type === 'metric-update') {
                    // Push single metric update to charts
                    if (window.pushChartData && msg.metric) {
                        window.pushChartData(msg.metric);
                    }
                } else if (msg.type === 'requests-update') {
                    console.log('[Dashboard Client] Received requests update', msg.requests);
                    if (window.updateRequestsList && msg.requests) {
                        window.updateRequestsList(msg.requests);
                    }
                } else if (msg.type === 'metrics') {
                    // Standard live update (text metrics)
                    updateDOM(msg);
                }
            } catch (e) {
                console.error("Failed to parse WebSocket message", e);
            }
        };

        ws.onclose = () => {
            console.log("Dashboard WebSocket disconnected");
            const statusEl = document.getElementById('ws-status');
            if (statusEl) {
                statusEl.style.background = '#ef4444'; // red
                statusEl.title = 'WebSocket: Disconnected';
            }
            ws = null;
            scheduleReconnect();
        };

        ws.onerror = (err) => {
            console.error("WebSocket error:", err);
            ws = null;
            // onclose will be called
        };
    }

    function scheduleReconnect() {
        if (reconnectTimer) return;
        console.log("Scheduling reconnect in 2s...");
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, 2000);
    }

    // Expose printDuration for other scripts if needed (poll.js did this)
    window.printDuration = formatDuration;

    // Start connection
    connect();

    // Listen for time range changes
    const timeSelector = document.getElementById('time-range-selector');
    if (timeSelector) {
        timeSelector.addEventListener('change', (e) => {
            const interval = e.target.value;
            console.log("Time range changed to:", interval);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'get-history', interval }));
            }
        });
    }

})();
