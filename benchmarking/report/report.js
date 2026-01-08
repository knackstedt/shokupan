// Main initialization
if (benchmarkData.length === 0) {
    document.getElementById('content').innerHTML = '<p>No benchmark data available yet. Run the benchmarks first!</p>';
} else {
    const latest = benchmarkData[0];
    initializeReport(latest.results, latest.system);
}

function initializeReport(latest, systemInfo) {
    const tabsContainer = document.getElementById('tabs');
    const contentContainer = document.getElementById('content');

    // Render system info if available
    if (systemInfo) {
        renderSystemInfo(contentContainer, systemInfo);
    }

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

function renderSystemInfo(container, system) {
    const sysDiv = document.createElement('div');
    sysDiv.className = 'system-info-card';
    sysDiv.style.marginBottom = '20px';
    sysDiv.style.padding = '15px';
    sysDiv.style.borderRadius = '8px';
    sysDiv.style.backgroundColor = '#25262b';
    sysDiv.style.border = '1px solid #373a40';
    sysDiv.style.color = '#c1c2c5';
    sysDiv.style.fontSize = '0.9rem';
    sysDiv.style.display = 'grid';
    sysDiv.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
    sysDiv.style.gap = '15px';

    const memoryGB = (system.memory.total / 1024 / 1024 / 1024).toFixed(2);
    const cpuSpeed = (system.cpu.speed / 1000).toFixed(2); // usually in MHz

    // Format fields
    const fields = [
        { label: 'OS', value: system.os },
        { label: 'Kernel', value: system.kernel },
        { label: 'CPU', value: `${system.cpu.model} (${system.cpu.cores} cores @ ${cpuSpeed}GHz)` },
        { label: 'Memory', value: `${memoryGB} GB Total` },
        { label: 'Runtime', value: `Bun v${system.bun} / Node ${system.node}` }
    ];

    sysDiv.innerHTML = fields.map(f => `
        <div class="sys-field">
            <div style="color: #909296; font-size: 0.8em; text-transform: uppercase; margin-bottom: 4px;">${f.label}</div>
            <div style="font-weight: 600; color: #e4e5e7;">${f.value}</div>
        </div>
    `).join('');

    // Insert at top of content container (or better, before content container in main body?)
    // The current layout is: tabs -> content. We likely want this above tabs.
    // Let's prepend to the main container, actually.
    const mainContainer = document.querySelector('.container');
    const tabs = document.getElementById('tabs');
    mainContainer.insertBefore(sysDiv, tabs);
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

    // Check if this is a multi-process scenario
    const isMultiProcess = scenario === 'multi-process' || scenario.startsWith('multi-process-');

    if (isMultiProcess) {
        // Add dedicated multi-process scaling charts
        html += buildMultiProcessCharts(scenarioIndex);
    } else {
        html += buildChartGrid(scenarioIndex);
    }

    // Remove scenario column for individual views
    const columns = TABLE_COLUMNS.filter(c => c.key !== 'scenario');
    html += buildTable(scenarioIndex, columns, false);

    container.innerHTML = html;

    if (isMultiProcess) {
        initializeMultiProcessView(scenarioIndex, tableData);
    } else {
        initializeTable(scenarioIndex, tableData, `chart-${scenarioIndex}-reqs`, `chart-${scenarioIndex}-latency`);
    }
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
        memory: result.memory || [],
        status: 'OK',
        statusClass: 'success'
    };
}

function createSparkline(data, width = 150, height = 25) {
    if (!data || data.length === 0) return '';

    const values = data.map(s => s.rss);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    const points = values.map((val, i) => {
        const x = (i / Math.max(1, values.length - 1)) * width;
        const y = height - ((val - min) / range) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return `<svg width="${width}" height="${height}" class="sparkline" style="stroke: #51cf66; fill: none; stroke-width: 1.5;">
        <polyline points="${points}"/>
    </svg>`;
}

function buildChartGrid(id) {
    return `
        <div class="chart-grid">
            <div class="chart-container"><canvas id="chart-${id}-reqs"></canvas></div>
            <div class="chart-container"><canvas id="chart-${id}-latency"></canvas></div>
        </div>
    `;
}

function buildMultiProcessCharts(id) {
    // We'll generate chart containers dynamically based on available frameworks
    return `
        <div class="multi-process-charts">
            <div class="scaling-hint">📊 Experimental framework comparison by endpoint: Bun vs Node.js performance across 1, 2, and 4 workers</div>
            <div class="endpoint-charts" id="framework-charts-${id}">
                <!-- Endpoint charts will be dynamically generated -->
            </div>
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
                const memoryData = row.memory || [];
                const memoryValues = memoryData.map(s => s.rss);
                const avgMemory = memoryValues.length ? Math.round(memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length) : 0;
                const peakMemory = memoryValues.length ? Math.max(...memoryValues) : 0;
                const memInGb = avgMemory / 1024;
                const memInGbPeak = peakMemory / 1024;
                const memoryCell = memoryValues.length > 0
                    ? `<td class="memory-cell">${createSparkline(memoryData)}<div class="memory-stats"><span class="avg">${memInGb.toFixed(2)}GB avg</span> <span class="peak">${memInGbPeak.toFixed(2)}GB peak</span></div></td>`
                    : '<td class="memory-cell"><span style="color: #666;">–</span></td>';
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
                    ${memoryCell}
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

function initializeMultiProcessView(id, tableData) {
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

        // Render rows with note about total requests/sec
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
                const memoryData = row.memory || [];
                const memoryValues = memoryData.map(s => s.rss);
                const avgMemory = memoryValues.length ? Math.round(memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length) : 0;
                const peakMemory = memoryValues.length ? Math.max(...memoryValues) : 0;
                const memInGb = avgMemory / 1024;
                const memInGbPeak = peakMemory / 1024;
                const memoryCell = memoryValues.length > 0
                    ? `<td class="memory-cell">${createSparkline(memoryData)}<div class="memory-stats"><span class="avg">${memInGb.toFixed(2)}GB avg</span> <span class="peak">${memInGbPeak.toFixed(2)}GB peak</span></div></td>`
                    : '<td class="memory-cell"><span style="color: #666;">–</span></td>';

                // For multi-process, show note that requests/sec is total across all workers
                const reqsCell = `<td><span class="metric">${row.requests.toFixed(0)}</span><span style="font-size: 0.8em; color: #666; display: block;">total</span></td>`;

                return `<tr>
                    <td>${row.framework}</td>
                    <td>${row.runtime}</td>
                    ${scenarioCol}
                    <td>${row.endpoint}</td>
                    ${reqsCell}
                    <td><span class="metric">${row.latency.toFixed(2)}</span></td>
                    <td><span class="metric">${(row.throughput / 1024 / 1024).toFixed(2)}</span></td>
                    <td><span class="metric">${row.p95.toFixed(2)}</span></td>
                    <td><span class="metric">${row.p99.toFixed(2)}</span></td>
                    ${memoryCell}
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

    // Create multi-process scaling charts for each endpoint
    setTimeout(() => {
        createMultiProcessCharts(tableData, id);
    }, 100);
}

function createMultiProcessCharts(tableData, id) {
    const container = document.getElementById(`framework-charts-${id}`);
    if (!container) return;

    container.innerHTML = '';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fit, minmax(500px, 1fr))';
    container.style.gap = '20px';
    container.style.padding = '20px';

    const validData = tableData.filter(d => !d.error && d.requests > 0);
    const frameworks = [...new Set(validData.map(d => d.framework))].sort();
    const endpoints = [
        { path: '/small-get', title: 'Small GET Response' },
        { path: '/large-get', title: 'Large GET Response' },
        { path: '/large-post', title: 'Large POST Request' }
    ];
    const runtimes = ['bun', 'node'];
    const workerCounts = [1, 2, 4];

    // Create one chart per endpoint
    endpoints.forEach(endpoint => {
        const chartSection = document.createElement('div');
        chartSection.style.backgroundColor = '#25262b';
        chartSection.style.padding = '20px';
        chartSection.style.borderRadius = '8px';
        chartSection.style.height = '500px';

        const title = document.createElement('h3');
        title.textContent = endpoint.title;
        title.style.color = '#e4e5e7';
        title.style.marginTop = '0';
        title.style.marginBottom = '15px';
        chartSection.appendChild(title);

        const chartContainer = document.createElement('div');
        chartContainer.style.height = 'calc(100% - 50px)';
        const canvas = document.createElement('canvas');
        const chartId = `chart-${endpoint.path.replace('/', '')}-${id}`;
        canvas.id = chartId;
        chartContainer.appendChild(canvas);
        chartSection.appendChild(chartContainer);
        container.appendChild(chartSection);

        // Build labels: framework + worker count
        const labels = [];
        frameworks.forEach(fw => {
            workerCounts.forEach(wc => {
                labels.push(`${fw}\n${wc}w`);
            });
        });

        // Build datasets for Bun and Node
        const datasets = [
            {
                label: 'Bun',
                backgroundColor: '#51cf66',
                data: []
            },
            {
                label: 'Node.js',
                backgroundColor: '#339af0',
                data: []
            }
        ];

        // Fill data for each framework and worker count
        frameworks.forEach(fw => {
            workerCounts.forEach(wc => {
                runtimes.forEach((rt, rtIdx) => {
                    const row = validData.find(d =>
                        d.framework === fw &&
                        d.runtime === rt &&
                        d.endpoint === `${endpoint.path} [${wc}w]`
                    );
                    datasets[rtIdx].data.push(row ? row.requests : 0);
                });
            });
        });

        new Chart(canvas, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#e4e5e7' }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            title: function (context) {
                                const label = context[0].label.split('\n');
                                return `${label[0]} - ${label[1]}`;
                            },
                            label: function (context) {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(0)} req/s`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Total Requests/sec', color: '#e4e5e7' },
                        ticks: { color: '#909296' },
                        grid: { color: '#373a40' }
                    },
                    x: {
                        ticks: { color: '#909296', font: { size: 10 }, maxRotation: 45, minRotation: 0 },
                        grid: { display: false }
                    }
                }
            }
        });
    });
}
