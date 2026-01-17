// @ts-nocheck

/**
 * @jsx h
 * @jsxFrag Fragment
 */

export function DashboardApp({ metrics, uptime, integrations, base, getRequestHeadersSource, rootPath, linkPattern }: any) {
    return (
        <html lang="en">
            <head>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Shokupan Debug Dashboard</title>
                <link href="https://unpkg.com/tabulator-tables@5.5.0/dist/css/tabulator_bootstrap5.min.css" rel="stylesheet" />
                <link rel="stylesheet" href="https://esm.sh/@xyflow/react@12.3.6/dist/style.css" />

                <link rel="stylesheet" href={`${base}/theme.css`} />
                <link rel="stylesheet" href={`${base}/styles.css`} />
                <link rel="stylesheet" href={`${base}/reactflow.css`} />
                <link rel="stylesheet" href={`${base}/registry.css`} />
                <link rel="stylesheet" href={`${base}/tabulator.css`} />

                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                <script type="text/javascript" src="https://unpkg.com/tabulator-tables@5.5.0/dist/js/tabulator.min.js"></script>
            </head>
            <body>
                <div class="container">
                    <header>
                        <div>
                            <h1>Dashboard</h1>
                            <div style="color: var(--text-secondary)">Uptime: <span id="uptime">{uptime}</span></div>
                        </div>
                        <div class="tabs">
                            <button class="tab-btn active" onclick="switchTab('overview')">Overview</button>
                            <button class="tab-btn" onclick="switchTab('registry')">Registry</button>
                            <button class="tab-btn" onclick="switchTab('graph')">Graph</button>
                            <button class="tab-btn" onclick="switchTab('requests')">Requests</button>
                            <button class="tab-btn" onclick="switchTab('failures')">Failures</button>
                            {integrations.scalar && (
                                <button class="tab-btn" onclick="switchTab('scalar')">Scalar</button>
                            )}
                            {integrations.apiExplorer && (
                                <button class="tab-btn" onclick="switchTab('api-explorer')">REST API</button>
                            )}
                            {integrations.asyncapi && (
                                <button class="tab-btn" onclick="switchTab('asyncapi')">WS API</button>
                            )}
                        </div>
                    </header>
                    <div class="contents">
                        {/* Overview Tab */}
                        <div id="tab-overview" class="tab-content active">
                            <MetricsGrid metrics={metrics} />

                            <div id="chart-container" style="display: flex; flex-direction: column; gap: 1rem;">
                                <div style="display: flex; justify-content: flex-end;">
                                    <select id="time-range-selector" onchange="updateCharts(); updateDashboard(); fetchTopStats();" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--card-border); padding: 5px; border-radius: 4px;">
                                        <option value="1m">1 Minute</option>
                                        <option value="5m">5 Minutes</option>
                                        <option value="30m">30 Minutes</option>
                                        <option value="1h">1 Hour</option>
                                        <option value="2h">2 Hours</option>
                                        <option value="6h">6 Hours</option>
                                        <option value="12h">12 Hours</option>
                                        <option value="1d">1 Day</option>
                                        <option value="3d">3 Days</option>
                                        <option value="7d">7 Days</option>
                                        <option value="30d">30 Days</option>
                                    </select>
                                </div>

                                <div class="card-container">
                                    <ChartCard title="Response Time" id="latencyChart" />
                                    <ChartCard title="Requests / Second" id="rpsChart" />
                                    <ChartCard title="CPU & Load" id="cpuChart" />
                                    <ChartCard title="Memory" id="memoryChart" />
                                    <ChartCard title="Heap Usage" id="heapChart" />
                                    <ChartCard title="Event Loop Latency" id="eventLoopChart" />
                                    <ChartCard title="Error Rate" id="errorRateChart" />
                                </div>

                                <div class="card-title" style="margin-top: 1rem;">Top Statistics</div>
                                <div class="card-container">
                                    <Card title="Top Requests" contentId="top-requests-table" />
                                    <Card title="Top Errors" contentId="top-errors-table" />
                                    <Card title="Most Frequent Failures" contentId="failing-requests-table" />
                                    <Card title="Slowest Requests" contentId="slowest-requests-table" />
                                </div>

                                <div id="table-container" style="padding: 0; margin-top: 1rem;">
                                    <div id="requests-table" class="table-dark"></div>
                                </div>
                            </div>
                            <div style="height: 2rem"></div>
                        </div>

                        {/* Registry Tab */}
                        <div id="tab-registry" class="tab-content" style="max-width: 1200px;">
                            <div id="registry-container" class="card" style="margin: 2rem;">
                                <div class="card-title">Component Registry</div>
                                <div id="registry-tree" style="padding: 0 1rem 1rem 1rem; font-family: monospace; font-size: 0.9rem;"></div>
                            </div>
                            <div style="height: 0rem"></div>
                        </div>

                        {/* Graph Tab */}
                        <div id="tab-graph" class="tab-content">
                            <div class="card" style="margin: 2rem;">
                                <div style="display: flex; gap: 1rem;">
                                    <input type="text" id="graph-search" placeholder="Search routes or middleware..." aria-label="Search routes or middleware" style="flex:1; padding: 0.5rem; border-radius: 0.5rem; background: var(--bg-primary); border: 1px solid var(--card-border); color: var(--text-primary);" />
                                </div>
                            </div>
                            <div id="cy" style="margin: 0 2rem; height: calc(100% - 6rem - 35px);"></div>
                        </div>

                        {/* Requests Tab */}
                        <div id="tab-requests" class="tab-content">
                            <div style="margin: 2rem;">
                                <div class="card" style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center; flex-direction: row">
                                    <div class="card-title">Recent Requests (Last 100)</div>
                                    <button onclick="fetchRequests()" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--card-border); padding: 5px 10px; border-radius: 6px; cursor: pointer; margin-right: 2rem">Refresh</button>
                                </div>
                                <div id="requests-list-container" style="height: calc(100vh - 300px); margin-bottom: 2rem;"></div>

                                <div id="request-details-container" class="card" style="display: none;">
                                    <div class="card-title">Request Details</div>
                                    <div id="request-details-content"></div>
                                    <div class="card-title" style="margin-top: 1rem;">Middleware Trace</div>
                                    <div id="middleware-trace-container"></div>
                                </div>
                                <div style="height: 2rem"></div>
                            </div>
                        </div>

                        {/* Failures Tab */}
                        <div id="tab-failures" class="tab-content">
                            <div style="margin: 2rem;">
                                <div class="card" style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
                                    <div class="card-title">Failed Requests (Last 50)</div>
                                    <div>
                                        <button onclick="importFailure()" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--card-border); padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 8px;">Import</button>
                                        <button onclick="fetchFailures()" style="background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--card-border); padding: 5px 10px; border-radius: 4px; cursor: pointer;">Refresh</button>
                                    </div>
                                </div>
                                <div id="failures-table-container"></div>
                            </div>
                        </div>

                        {integrations.scalar && (
                            <div id="tab-scalar" class="tab-content" style="overflow: hidden; height: 100%; width: 100%">
                                <iframe src={integrations.scalar} style="width: 100%; height: 100%; border: none;"></iframe>
                            </div>
                        )}

                        {integrations.apiExplorer && (
                            <div id="tab-api-explorer" class="tab-content" style="overflow: hidden; height: 100%; width: 100%">
                                <iframe src={integrations.apiExplorer} style="width: 100%; height: 100%; border: none;"></iframe>
                            </div>
                        )}

                        {integrations.asyncapi && (
                            <div id="tab-asyncapi" class="tab-content" style="overflow: hidden; height: 100%; width: 100%">
                                <iframe src={integrations.asyncapi} style="width: 100%; height: 100%; border: none;"></iframe>
                            </div>
                        )}
                    </div>
                </div>

                <script dangerouslySetInnerHTML={{
                    __html: `
                    // Injected function from server config
                    const getRequestHeaders = ${getRequestHeadersSource};
                    window.SHOKUPAN_CONFIG = {
                        rootPath: "${rootPath || ""}",
                        linkPattern: "${linkPattern || ""}"
                    };
                `}} />

                <script src={`${base}/client.js`}></script>
                <script src={`${base}/graph.mjs`} type="module"></script>
                <script src={`${base}/charts.js`}></script>
                <script src={`${base}/tables.js`}></script>
                <script src={`${base}/registry.js`}></script>
                <script src={`${base}/failures.js`}></script>
                <script src={`${base}/requests.js`}></script>
                <script src={`${base}/tabs.js`}></script>
            </body>
        </html>
    );
}

function MetricsGrid({ metrics }: any) {
    const total = metrics.totalRequests;
    const active = metrics.activeRequests;
    const finished = total - active;

    // Safety check div by zero
    const successRate = finished ? Math.round((metrics.successfulRequests / finished) * 100) : 100;
    const failRate = finished ? Math.round((metrics.failedRequests / finished) * 100) : 0;

    return (
        <div class="metrics-grid">
            <div class="card">
                <div class="card-title">Total Requests</div>
                <div class="card-value" id="total-requests">
                    {metrics.totalRequests}
                </div>
            </div>

            <div class="card">
                <div class="card-title">Active Requests</div>
                <div class="card-value" style="color: var(--accent)" id="active-requests">
                    {metrics.activeRequests}
                </div>
            </div>

            <div class="card">
                <div class="card-title">Success Rate</div>
                <div class="card-value text-success">
                    <span id="success-rate">{successRate}%</span>
                </div>
                <div style="color: var(--text-secondary); margin-top: 0.5rem">
                    <span id="successful-requests">{metrics.successfulRequests}</span> successful
                </div>
            </div>

            <div class="card">
                <div class="card-title">Fail Rate</div>
                <div class="card-value text-error">
                    <span id="fail-rate">{failRate}%</span>
                </div>
                <div style="color: var(--text-secondary); margin-top: 0.5rem">
                    <span id="failed-requests">{metrics.failedRequests}</span> failed
                </div>
            </div>

            <div class="card">
                <div class="card-title">Avg Latency</div>
                <div class="card-value">
                    <span id="avg-latency">
                        {metrics.averageTotalTime_ms.toFixed(2)}
                    </span> <span style="font-size: 1rem; color: var(--text-secondary)">ms</span>
                </div>
            </div>
        </div>
    );
}

function ChartCard({ title, id }: any) {
    return (
        <div class="card" style="height: 300px;">
            <div class="card-title">{title}</div>
            <div class="card-chart">
                <canvas id={id}></canvas>
            </div>
        </div>
    );
}

function Card({ title, contentId }: any) {
    return (
        <div class="card">
            <div class="card-title">{title}</div>
            <div id={contentId}></div>
        </div>
    );
}
