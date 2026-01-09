
function printDuration(deltaMs/** number in ms */) {

    // More than 1 week
    if (deltaMs > (7 * 24 * 60 * 60 * 1000)) {
        const weeks = (deltaMs / (7 * 24 * 60 * 60 * 1000));
        const weeksR = (deltaMs % (7 * 24 * 60 * 60 * 1000));

        if (weeks >= 10) {
            return weeks.toFixed(0) + " weeks";
        }
        else {
            const days = (weeksR / (24 * 60 * 60 * 1000));

            if (days >= 1) {
                return weeks.toFixed(0) + " weeks " + days.toFixed(0) + " days";
            }

            return weeks.toFixed(0) + " weeks";
        }
    }
    // More than 1 day
    else if (deltaMs > (24 * 60 * 60 * 1000)) {
        const days = (deltaMs / (24 * 60 * 60 * 1000));
        const daysR = (deltaMs % (24 * 60 * 60 * 1000));

        if (days >= 10) {
            return days.toFixed(0) + " days";
        }
        else {
            const hours = (daysR / (60 * 60 * 1000));

            if (hours >= 1) {
                return days.toFixed(0) + " days " + hours.toFixed(0) + " hours";
            }

            return days.toFixed(0) + " days";
        }
    }
    // More than 1 hour
    else if (deltaMs > (60 * 60 * 1000)) {
        const hours = (deltaMs / (60 * 60 * 1000));
        const hoursR = (deltaMs % (60 * 60 * 1000));

        if (hours >= 10) {
            return hours.toFixed(0) + " hours";
        }
        else {
            const minutes = (hoursR / (60 * 1000));

            if (minutes >= 1) {
                return hours.toFixed(0) + " hours " + minutes.toFixed(0) + " minutes";
            }

            return hours.toFixed(0) + " hours";
        }
    }
    // less than an hour, print minutes
    else if (deltaMs > 60 * 1000) {
        const minutes = (deltaMs / (60 * 1000));
        const minutesR = (deltaMs % (60 * 1000));

        if (minutes >= 10) {
            return minutes.toFixed(0) + " minutes";
        }
        else {
            const seconds = (minutesR / (1000));

            if (seconds >= 1) {
                return minutes.toFixed(0) + " minutes " + seconds.toFixed(0) + " seconds";
            }

            return minutes.toFixed(0) + " minutes";
        }
    }
    // Seconds (whoa)
    else if (deltaMs > 1000) {
        const seconds = (deltaMs / (60 * 1000));

        if (seconds >= 10) {
            return seconds.toFixed(0) + " seconds";
        }
        else {
            return seconds.toFixed(2) + " seconds";
        }
    }
    // Milliseconds
    else if (deltaMs > 1) {
        const ms = deltaMs;
        return ms.toFixed(0) + " ms";
    }
    // Microseconds
    else if (deltaMs > 0.0001) {
        const us = deltaMs;
        return us.toFixed(0) + " us";
    }
    else return "N/A";
}

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
            window.renderRegistry(window.registryData, registryContainer);
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

    } catch (err) {
        console.error("Failed to update dashboard", err);
    }
}

// Auto-refresh every 2 seconds
setInterval(updateDashboard, 2000);
// Initial load
updateDashboard();


