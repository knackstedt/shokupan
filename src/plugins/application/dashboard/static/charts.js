
// Common chart config
const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { labels: { color: '#94a3b8' } }
    },
    scales: {
        x: {
            ticks: { color: '#94a3b8' },
            grid: { color: '#334155' }
        },
        y: {
            ticks: { color: '#94a3b8' },
            grid: { color: '#334155' },
            beginAtZero: true
        }
    },
    animation: { duration: 0 },
    interaction: {
        mode: 'index',
        intersect: false,
    },
};

// Get request headers from global function if available
const headers = typeof getRequestHeaders !== 'undefined' ? getRequestHeaders() : {};

// Determine base path for API requests
const basePath = window.location.pathname.endsWith('/') ? window.location.pathname.slice(0, -1) : window.location.pathname;
const url = basePath + '/';

// Chart instances

// --- Latency Chart ---
const latencyCtx = document.getElementById('latencyChart').getContext('2d');
const latencyChart = new Chart(latencyCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Msg (Avg)',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: false
            },
            {
                label: 'p95',
                data: [],
                borderColor: '#eab308',
                backgroundColor: 'rgba(234, 179, 8, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: false
            },
            {
                label: 'p99',
                data: [],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: false
            }
        ]
    },
    options: commonOptions
});

// --- RPS Chart ---
const rpsCtx = document.getElementById('rpsChart').getContext('2d');
const rpsChart = new Chart(rpsCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Total Requests',
                data: [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            },
            {
                label: 'Errors',
                data: [],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }
        ]
    },
    options: commonOptions
});

// --- CPU Chart ---
const cpuCtx = document.getElementById('cpuChart').getContext('2d');
const cpuChart = new Chart(cpuCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'CPU Load (1m)',
                data: [],
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }
        ]
    },
    options: commonOptions
});

// --- Memory Chart ---
const memoryCtx = document.getElementById('memoryChart').getContext('2d');
const memoryChart = new Chart(memoryCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Heap Used (MB)',
                data: [],
                borderColor: '#f97316',
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            },
            {
                label: 'RSS (MB)',
                data: [],
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }
        ]
    },
    options: commonOptions
});

// --- Heap Chart ---
const heapCtx = document.getElementById('heapChart').getContext('2d');
const heapChart = new Chart(heapCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Heap Used (MB)',
                data: [],
                borderColor: '#f97316',
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            },
            {
                label: 'Heap Total (MB)',
                data: [],
                borderColor: '#fb923c',
                backgroundColor: 'rgba(251, 146, 60, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: false
            }
        ]
    },
    options: commonOptions
});

// --- Event Loop Latency Chart ---
const eventLoopCtx = document.getElementById('eventLoopChart').getContext('2d');
const eventLoopChart = new Chart(eventLoopCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Mean (ms)',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: false
            },
            {
                label: 'p95 (ms)',
                data: [],
                borderColor: '#eab308',
                backgroundColor: 'rgba(234, 179, 8, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: false
            },
            {
                label: 'p99 (ms)',
                data: [],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: false
            }
        ]
    },
    options: commonOptions
});

// --- Error Rate Chart ---
const errorRateCtx = document.getElementById('errorRateChart').getContext('2d');
const errorRateChart = new Chart(errorRateCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Success Rate (%)',
                data: [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            },
            {
                label: 'Error Rate (%)',
                data: [],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }
        ]
    },
    options: commonOptions
});

// Helper to update a chart with a new data point
function pushData(chart, label, datasetValues) {
    if (!chart.data.labels) chart.data.labels = [];
    chart.data.labels.push(label);
    if (chart.data.labels.length > 60) chart.data.labels.shift();

    datasetValues.forEach((val, idx) => {
        if (!chart.data.datasets[idx]) return;
        chart.data.datasets[idx].data.push(val);
        if (chart.data.datasets[idx].data.length > 60) chart.data.datasets[idx].data.shift();
    });
    chart.update(); // Use default update for reliability
}

// Initialize charts with history
window.initCharts = function (history) {
    if (!history || !Array.isArray(history)) return;

    // Sort by timestamp just in case
    history.sort((a, b) => a.timestamp - b.timestamp);

    const labels = history.map(m => new Date(m.timestamp).toLocaleTimeString());

    // Helper to batch set data
    const setChartData = (chart, dataExtractors) => {
        chart.data.labels = [...labels];
        dataExtractors.forEach((extractor, idx) => {
            if (chart.data.datasets[idx]) {
                chart.data.datasets[idx].data = history.map(extractor);
            }
        });
        chart.update();
    };

    setChartData(latencyChart, [
        m => m.responseTime.avg,
        m => m.responseTime.p95,
        m => m.responseTime.p99
    ]);

    setChartData(rpsChart, [
        m => m.requests.total,
        m => m.requests.error
    ]);

    setChartData(cpuChart, [
        m => m.cpu
    ]);

    setChartData(memoryChart, [
        m => (m.memory.heapUsed / 1024 / 1024).toFixed(2),
        m => (m.memory.used / 1024 / 1024).toFixed(2)
    ]);

    setChartData(heapChart, [
        m => (m.memory.heapUsed / 1024 / 1024).toFixed(2),
        m => (m.memory.heapTotal / 1024 / 1024).toFixed(2)
    ]);

    setChartData(eventLoopChart, [
        m => m.eventLoopLatency.mean,
        m => m.eventLoopLatency.p95,
        m => m.eventLoopLatency.p99
    ]);

    setChartData(errorRateChart, [
        m => {
            const total = m.requests.success + m.requests.error;
            return total > 0 ? ((m.requests.success / total) * 100).toFixed(2) : 100;
        },
        m => {
            const total = m.requests.success + m.requests.error;
            return total > 0 ? ((m.requests.error / total) * 100).toFixed(2) : 0;
        }
    ]);
};

// Push a single metric update
window.pushChartData = function (metric) {
    if (!metric) return;
    // Debug log
    console.log('[Dashboard Client] pushChartData called', metric);
    const label = new Date(metric.timestamp).toLocaleTimeString();

    pushData(latencyChart, label, [
        metric.responseTime.avg,
        metric.responseTime.p95,
        metric.responseTime.p99
    ]);

    pushData(rpsChart, label, [
        metric.requests.total,
        metric.requests.error
    ]);

    pushData(cpuChart, label, [
        metric.cpu
    ]);

    pushData(memoryChart, label, [
        (metric.memory.heapUsed / 1024 / 1024).toFixed(2),
        (metric.memory.used / 1024 / 1024).toFixed(2)
    ]);

    pushData(heapChart, label, [
        (metric.memory.heapUsed / 1024 / 1024).toFixed(2),
        (metric.memory.heapTotal / 1024 / 1024).toFixed(2)
    ]);

    pushData(eventLoopChart, label, [
        metric.eventLoopLatency.mean,
        metric.eventLoopLatency.p95,
        metric.eventLoopLatency.p99
    ]);

    const total = metric.requests.success + metric.requests.error;
    pushData(errorRateChart, label, [
        total > 0 ? ((metric.requests.success / total) * 100).toFixed(2) : 100,
        total > 0 ? ((metric.requests.error / total) * 100).toFixed(2) : 0
    ]);
};


// Old updateCharts exposed for manual refresh if needed (e.g. changing time range)
window.refreshCharts = async function () {
    const period = document.getElementById('time-range-selector').value || '1m';
    try {
        const res = await fetch(`${url}metrics/history?interval=${period}`, { headers });
        const data = await res.json();
        const metrics = data.metrics || [];
        window.initCharts(metrics);
    } catch (e) {
        console.error("Failed to fetch metrics", e);
    }
};

// Initial load listener - removed polling
document.addEventListener("DOMContentLoaded", () => {
    // window.refreshCharts(); 
    // Wait for WS init instead
});
