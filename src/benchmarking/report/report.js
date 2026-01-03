// Main initialization
if (benchmarkData.length === 0) {
    document.getElementById('content').innerHTML = '<p>No benchmark data available yet. Run the benchmarks first!</p>';
} else {
    const latest = benchmarkData[0].results;
    initializeReport(latest);
}

function initializeReport(latest) {
    const tabsContainer = document.getElementById('tabs');
    const contentContainer = document.getElementById('content');
    let tabIndex = 0;

    // Add composite view tabs first
    Object.entries(COMPOSITE_VIEWS).forEach(([viewId, viewConfig]) => {
        const hasData = viewConfig.scenarios.some(s => actualScenarios.includes(s));
        if (hasData) {
            createTab(tabsContainer, viewId, viewConfig.name, tabIndex === 0);
            createTabContent(contentContainer, viewId, tabIndex === 0);
            tabIndex++;
        }
    });

    // Add individual scenario tabs
    actualScenarios.forEach((scenario) => {
        const name = scenarioNames[scenario] || scenario;
        createTab(tabsContainer, scenario, name, tabIndex === 0);
        createTabContent(contentContainer, scenario, tabIndex === 0);
        tabIndex++;
    });

    // Render composite views
    Object.entries(COMPOSITE_VIEWS).forEach(([viewId, viewConfig]) => {
        const availableScenarios = viewConfig.scenarios.filter(s => actualScenarios.includes(s));
        if (availableScenarios.length > 0) {
            renderCompositeView(viewId, viewConfig, availableScenarios, latest);
        }
    });

    // Render individual scenarios
    actualScenarios.forEach((scenario, index) => {
        renderScenarioView(scenario, index, latest);
    });
}

function createTab(container, id, text, isActive) {
    const tab = document.createElement('button');
    tab.className = 'tab' + (isActive ? ' active' : '');
    tab.textContent = text;
    tab.onclick = (e) => showScenario(id, e);
    container.appendChild(tab);
}

function createTabContent(container, id, isActive) {
    const content = document.createElement('div');
    content.className = 'tab-content' + (isActive ? ' active' : '');
    content.id = `scenario-${id}`;
    container.appendChild(content);
}

function showScenario(scenario, event) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(`scenario-${scenario}`).classList.add('active');
}

function renderCompositeView(viewId, viewConfig, availableScenarios, latest) {
    const container = document.getElementById(`scenario-${viewId}`);
    const tableData = buildCompositeTableData(availableScenarios, latest);

    let html = `<h2>${viewConfig.name}</h2>`;
    html += buildChartGrid(viewId);
    html += buildTable(viewId, TABLE_COLUMNS, true); // true = include scenario column

    container.innerHTML = html;

    initializeTable(viewId, tableData, `chart-${viewId}-reqs`, `chart-${viewId}-latency`);
}

function renderScenarioView(scenario, scenarioIndex, latest) {
    const container = document.getElementById(`scenario-${scenario}`);
    const tableData = buildScenarioTableData(scenario, latest);

    let html = `<h2>${scenarioNames[scenario] || scenario}</h2>`;
    html += buildChartGrid(scenarioIndex);

    // Remove scenario column for individual views
    const columns = TABLE_COLUMNS.filter(c => c.key !== 'scenario');
    html += buildTable(scenarioIndex, columns, false);

    container.innerHTML = html;

    initializeTable(scenarioIndex, tableData, `chart-${scenarioIndex}-reqs`, `chart-${scenarioIndex}-latency`);
}

function buildCompositeTableData(scenarios, latest) {
    const tableData = [];

    Object.entries(latest).forEach(([framework, runtimes]) => {
        Object.entries(runtimes).forEach(([runtime, scenariosData]) => {
            scenarios.forEach(scenario => {
                const scenarioData = scenariosData[scenario];
                const scenarioName = scenarioNames[scenario] || scenario;

                if (scenarioData && scenarioData.error) {
                    tableData.push(createErrorRow(framework, runtime, scenarioName, '-', scenarioData.error));
                } else if (scenarioData) {
                    Object.entries(scenarioData).forEach(([endpoint, result]) => {
                        // Skip metadata fields like 'duration'
                        if (endpoint === 'duration') return;

                        if (result.error) {
                            tableData.push(createErrorRow(framework, runtime, scenarioName, endpoint, result.error));
                        } else {
                            tableData.push(createDataRow(framework, runtime, scenarioName, endpoint, result));
                        }
                    });
                }
            });
        });
    });

    return tableData;
}

function buildScenarioTableData(scenario, latest) {
    const tableData = [];

    Object.entries(latest).forEach(([framework, runtimes]) => {
        Object.entries(runtimes).forEach(([runtime, scenarios]) => {
            const scenarioData = scenarios[scenario];

            if (scenarioData) {
                Object.entries(scenarioData).forEach(([endpoint, result]) => {
                    // Skip metadata fields like 'duration'
                    if (endpoint === 'duration') return;

                    if (result.error) {
                        tableData.push(createErrorRow(framework, runtime, null, endpoint, result.error));
                    } else {
                        tableData.push(createDataRow(framework, runtime, null, endpoint, result));
                    }
                });
            }
        });
    });

    return tableData;
}

function createErrorRow(framework, runtime, scenario, endpoint, error) {
    return {
        framework,
        runtime,
        scenario,
        endpoint,
        requests: 0,
        latency: 0,
        throughput: 0,
        p95: 0,
        p99: 0,
        status: error.startsWith('Skipped') ? 'SKIPPED' : 'FAILED',
        error,
        statusClass: error.startsWith('Skipped') ? 'skipped' : 'error'
    };
}

function createDataRow(framework, runtime, scenario, endpoint, result) {
    return {
        framework,
        runtime,
        scenario,
        endpoint,
        requests: result.requests || 0,
        latency: result.latency || 0,
        throughput: result.throughput || 0,
        p95: result.percentiles?.p95 || 0,
        p99: result.percentiles?.p99 || 0,
        status: 'OK',
        statusClass: 'success'
    };
}

function buildChartGrid(id) {
    return `
        <div class="chart-grid">
            <div class="chart-container"><canvas id="chart-${id}-reqs"></canvas></div>
            <div class="chart-container"><canvas id="chart-${id}-latency"></canvas></div>
        </div>
    `;
}

function buildTable(id, columns, includeScenario) {
    let html = `<div class="table-container"><table id="table-${id}"><thead><tr>`;

    columns.forEach(col => {
        html += `<th data-column="${col.key}"><span class="sort-icon"></span>${col.label}</th>`;
    });

    html += '</tr><tr class="filter-row">';

    columns.forEach(col => {
        html += `<th><input type="text" class="filter-input" data-column="${col.key}" placeholder="Filter..."></th>`;
    });

    html += `</tr></thead><tbody id="tbody-${id}"></tbody></table></div>`;
    return html;
}

function initializeTable(id, tableData, reqsChartId, latencyChartId) {
    const table = document.getElementById(`table-${id}`);
    const tbody = document.getElementById(`tbody-${id}`);
    let currentSort = { column: 'requests', direction: 'desc' };
    let filters = {};

    function renderTable() {
        let filteredData = [...tableData];

        // Apply filters
        Object.entries(filters).forEach(([column, value]) => {
            if (value) {
                filteredData = filteredData.filter(row => {
                    const cellValue = String(row[column] || '').toLowerCase();
                    return cellValue.includes(value.toLowerCase());
                });
            }
        });

        // Apply sort
        filteredData.sort((a, b) => {
            let aVal = a[currentSort.column];
            let bVal = b[currentSort.column];

            if (typeof aVal === 'number') {
                return currentSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
            } else {
                aVal = String(aVal).toLowerCase();
                bVal = String(bVal).toLowerCase();
                if (currentSort.direction === 'asc') {
                    return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                } else {
                    return bVal < aVal ? -1 : bVal > aVal ? 1 : 0;
                }
            }
        });

        // Render rows
        tbody.innerHTML = filteredData.map(row => {
            if (row.error) {
                const cols = row.scenario ?
                    `<td>${row.framework}</td><td>${row.runtime}</td><td>${row.scenario}</td>` :
                    `<td>${row.framework}</td><td>${row.runtime}</td>`;
                const colspan = row.scenario ? 6 : 7;
                return `<tr>
                    ${cols}
                    <td colspan="${colspan}"><span class="${row.statusClass}">${row.error}</span></td>
                    <td class="${row.statusClass}">${row.status}</td>
                </tr>`;
            } else {
                const scenarioCol = row.scenario ? `<td>${row.scenario}</td>` : '';
                return `<tr>
                    <td>${row.framework}</td>
                    <td>${row.runtime}</td>
                    ${scenarioCol}
                    <td>${row.endpoint}</td>
                    <td><span class="metric">${row.requests.toFixed(0)}</span></td>
                    <td><span class="metric">${row.latency.toFixed(2)}</span></td>
                    <td><span class="metric">${(row.throughput / 1024 / 1024).toFixed(2)}</span></td>
                    <td><span class="metric">${row.p95.toFixed(2)}</span></td>
                    <td><span class="metric">${row.p99.toFixed(2)}</span></td>
                    <td class="${row.statusClass}">✓ ${row.status}</td>
                </tr>`;
            }
        }).join('');
    }

    // Add sort handlers
    table.querySelectorAll('thead tr:first-child th').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.column;
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'desc';
            }

            table.querySelectorAll('thead tr:first-child th').forEach(h => {
                h.classList.remove('sorted-asc', 'sorted-desc');
            });
            th.classList.add('sorted-' + currentSort.direction);

            renderTable();
        });
    });

    // Add filter handlers
    table.querySelectorAll('.filter-input').forEach(input => {
        input.addEventListener('input', (e) => {
            filters[e.target.dataset.column] = e.target.value;
            renderTable();
        });
    });

    // Initial render
    table.querySelector(`th[data-column="${currentSort.column}"]`).classList.add('sorted-desc');
    renderTable();

    // Create charts
    setTimeout(() => createCharts(tableData, reqsChartId, latencyChartId), 100);
}

function createCharts(tableData, reqsChartId, latencyChartId) {
    const validData = tableData.filter(d => !d.error && d.requests > 0);
    const groupedData = {};

    validData.forEach(row => {
        const key = `${row.framework} (${row.runtime})`;
        if (!groupedData[key]) {
            groupedData[key] = { requests: [], latency: [] };
        }
        groupedData[key].requests.push(row.requests);
        groupedData[key].latency.push(row.latency);
    });

    const labels = Object.keys(groupedData);
    const avgRequests = labels.map(k => groupedData[k].requests.reduce((a, b) => a + b, 0) / groupedData[k].requests.length);
    const avgLatency = labels.map(k => groupedData[k].latency.reduce((a, b) => a + b, 0) / groupedData[k].latency.length);

    // Requests chart
    new Chart(document.getElementById(reqsChartId), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Requests/sec',
                data: avgRequests,
                backgroundColor: labels.map(l => COLORS[l.split(' ')[0]] || '#909296')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Average Requests per Second', color: '#e4e5e7' },
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { color: '#909296' }, grid: { color: '#373a40' } },
                x: { ticks: { color: '#909296' }, grid: { color: '#373a40' } }
            }
        }
    });

    // Latency chart
    new Chart(document.getElementById(latencyChartId), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Latency (ms)',
                data: avgLatency,
                backgroundColor: labels.map(l => COLORS[l.split(' ')[0]] || '#909296')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Average Latency (lower is better)', color: '#e4e5e7' },
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { color: '#909296' }, grid: { color: '#373a40' } },
                x: { ticks: { color: '#909296' }, grid: { color: '#373a40' } }
            }
        }
    });
}
