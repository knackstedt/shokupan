
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

async function updateCharts() {
    const period = document.getElementById('time-range-selector').value || '1m';
    try {
        const res = await fetch(`${url}metrics/history?interval=${period}`, { headers });
        const data = await res.json();
        const metrics = data.metrics || [];

        const labels = metrics.map(m => new Date(m.timestamp).toLocaleTimeString());

        // Latency
        latencyChart.data.labels = labels;
        latencyChart.data.datasets[0].data = metrics.map(m => m.responseTime.avg);
        latencyChart.data.datasets[1].data = metrics.map(m => m.responseTime.p95);
        latencyChart.data.datasets[2].data = metrics.map(m => m.responseTime.p99);
        latencyChart.update();

        // RPS
        rpsChart.data.labels = labels;
        rpsChart.data.datasets[0].data = metrics.map(m => m.requests.total);
        rpsChart.data.datasets[1].data = metrics.map(m => m.requests.error);
        rpsChart.update();

        // CPU
        cpuChart.data.labels = labels;
        cpuChart.data.datasets[0].data = metrics.map(m => m.cpu);
        cpuChart.update();

        // Memory
        memoryChart.data.labels = labels;
        memoryChart.data.datasets[0].data = metrics.map(m => (m.memory.heapUsed / 1024 / 1024).toFixed(2));
        memoryChart.data.datasets[1].data = metrics.map(m => (m.memory.used / 1024 / 1024).toFixed(2));
        memoryChart.update();

        // Heap
        heapChart.data.labels = labels;
        heapChart.data.datasets[0].data = metrics.map(m => (m.memory.heapUsed / 1024 / 1024).toFixed(2));
        heapChart.data.datasets[1].data = metrics.map(m => (m.memory.heapTotal / 1024 / 1024).toFixed(2));
        heapChart.update();

        // Event Loop Latency
        eventLoopChart.data.labels = labels;
        eventLoopChart.data.datasets[0].data = metrics.map(m => m.eventLoopLatency.mean);
        eventLoopChart.data.datasets[1].data = metrics.map(m => m.eventLoopLatency.p95);
        eventLoopChart.data.datasets[2].data = metrics.map(m => m.eventLoopLatency.p99);
        eventLoopChart.update();

        // Error Rate
        errorRateChart.data.labels = labels;
        errorRateChart.data.datasets[0].data = metrics.map(m => {
            const total = m.requests.success + m.requests.error;
            return total > 0 ? ((m.requests.success / total) * 100).toFixed(2) : 100;
        });
        errorRateChart.data.datasets[1].data = metrics.map(m => {
            const total = m.requests.success + m.requests.error;
            return total > 0 ? ((m.requests.error / total) * 100).toFixed(2) : 0;
        });
        errorRateChart.update();

    } catch (e) {
        console.error("Failed to fetch metrics", e);
    }
}

// Initial load
document.addEventListener("DOMContentLoaded", () => {
    updateCharts();
    // Poll every 10s for short intervals
    setInterval(() => {
        const period = document.getElementById('time-range-selector').value;
        if (['1m', '5m', '30m', '1h', '2h'].includes(period)) {
            updateCharts();
        }
    }, 10000);
});
