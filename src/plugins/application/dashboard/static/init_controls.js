
// Initialize time range selector events
(function () {
    const timeSelector = document.getElementById('time-range-selector');
    if (timeSelector) {
        timeSelector.addEventListener('change', () => {
            if (typeof updateCharts === 'function') updateCharts();
            if (typeof updateDashboard === 'function') updateDashboard();
            if (typeof fetchTopStats === 'function') fetchTopStats();
        });
    }
})();
