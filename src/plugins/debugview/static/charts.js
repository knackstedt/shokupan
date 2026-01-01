// --- Chart.js Setup ---
const ctx = document.getElementById('latencyChart').getContext('2d');
const latencyChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Response Time (ms)',
            data: [],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: '#94a3b8' }
            }
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
        animation: {
            duration: 0
        }
    }
});

// --- Tabulator Setup ---
const table = new Tabulator("#requests-table", {
    layout: "fitColumns",
    height: "400px",
    placeholder: "No requests yet...",
    data: [], // Initial data (empty until first fetch)
    columns: [
        {
            title: "Status", field: "status", width: 90, formatter: function (cell) {
                const status = cell.getValue();
                const color = status >= 400 ? '#ef4444' : '#22c55e';
                return `<span style="color: ${color}; font-weight: bold;">${status}</span>`;
            }
        },
        { title: "Method", field: "method", width: 100, headerFilter: "input" },
        { title: "URL", field: "url", headerFilter: "input" },
        { title: "Duration (ms)", field: "duration", width: 150, formatter: (cell) => cell.getValue().toFixed(2) },
        {
            title: "Time", field: "timestamp", width: 200, formatter: function (cell) {
                return new Date(cell.getValue()).toLocaleTimeString();
            }
        },
    ],
    initialSort: [
        { column: "timestamp", dir: "desc" } // Sort by newest first
    ]
});
