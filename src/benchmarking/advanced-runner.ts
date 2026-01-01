import autocannon from "autocannon";
import { spawn } from "bun";
import fs from "fs";
import path from "path";

const FRAMEWORKS = ["shokupan", "fastify", "express", "koa", "hapi", "nest", "hono", "elysia"];
const RUNTIMES = ["bun", "node"];

// Advanced scenarios
type ScenarioConfig = {
    name: string;
    endpoints: string[];
    connections: number;
    duration: number;
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    timeout?: number;
};

const SCENARIOS: Record<string, ScenarioConfig> = {
    // Compression tests - test each algorithm separately
    "compression-gzip": {
        name: "Compression (gzip)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        headers: { "Accept-Encoding": "gzip" }
    },
    "compression-brotli": {
        name: "Compression (brotli)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        headers: { "Accept-Encoding": "br" }
    },
    "compression-deflate": {
        name: "Compression (deflate)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        headers: { "Accept-Encoding": "deflate" }
    },
    "compression-zstd": {
        name: "Compression (zstd)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        headers: { "Accept-Encoding": "zstd" }
    },
    "compression-store": {
        name: "No Compression (baseline)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        headers: {}
    },

    // Large payload tests
    "large-payload-request": {
        name: "Large Request Payload (10MB POST)",
        endpoints: ["/large-request"],
        connections: 50,
        duration: 10,
        method: "POST",
        body: "x".repeat(10 * 1024 * 1024), // 10MB
        headers: { "Content-Type": "application/json" }
    },
    "large-payload-response": {
        name: "Large Response Payload (5MB JSON)",
        endpoints: ["/large-response"],
        connections: 50,
        duration: 10
    },
    "large-payload-headers": {
        name: "Large Headers (100 headers)",
        endpoints: ["/large-headers"],
        connections: 100,
        duration: 10
    },

    // Math middleware test
    "math-middleware": {
        name: "10 MD5 Middleware Chain",
        endpoints: ["/compute"],
        connections: 100,
        duration: 10
    },

    // Scaling test
    "scaling": {
        name: "1000 Route Handlers (Scaling)",
        endpoints: Array.from({ length: 10 }, (_, i) => `/route-${Math.floor(Math.random() * 1000)}`),
        connections: 100,
        duration: 10
    },

    // Fully loaded test
    "fully-loaded": {
        name: "Fully Loaded (OTel + Validators + ALS)",
        endpoints: ["/validate"],
        connections: 100,
        duration: 10,
        method: "POST",
        body: JSON.stringify({ data: "test" }),
        headers: { "Content-Type": "application/json" }
    },

    // Long pending test - tests high concurrency with small delays
    "long-pending": {
        name: "High Concurrency (1000 concurrent, 100ms delay)",
        endpoints: ["/delayed"],
        connections: 1000,
        duration: 10,
        timeout: 30 // Allow enough time for responses
    }
};

const CASES_DIR = path.join(import.meta.dir, "advanced-cases");
const DIST_DIR = path.join(import.meta.dir, "dist");
const WORKER_TS = path.join(import.meta.dir, "advanced-worker.ts");
const WORKER_JS = path.join(DIST_DIR, "advanced-worker.cjs");
const REPORT_PATH = path.join(import.meta.dir, "advanced-report.html");
const HISTORY_PATH = path.join(import.meta.dir, "advanced-results.json");

type BenchmarkResult = {
    requests: number;
    latency: number;
    throughput: number;
    error?: string;
    percentiles?: Record<string, number>;
};

type ScenarioResults = Record<string, BenchmarkResult>; // endpoint -> result
type RuntimeResults = Record<string, ScenarioResults>; // scenario -> endpoints -> result
type FrameworkResults = Record<string, RuntimeResults>; // runtime -> scenario -> endpoints -> result
type AllResults = Record<string, FrameworkResults>; // framework -> runtime -> scenario -> endpoints -> result

type HistoryEntry = {
    timestamp: number;
    results: AllResults;
};

const args = process.argv.slice(2);
const filterIndex = args.indexOf("--filter");
const filter = filterIndex !== -1 ? args[filterIndex + 1] : null;
const scenarioIndex = args.indexOf("--scenario");
const scenarioFilter = scenarioIndex !== -1 ? args[scenarioIndex + 1] : null;

async function compileForNode(targetFrameworks: string[]) {
    console.log("Compiling advanced cases for Node.js...");
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR);
    }

    // Compile worker
    const workerProc = spawn(["bun", "build",
        WORKER_TS,
        "--outfile", path.join(DIST_DIR, "advanced-worker.cjs"),
        "--target", "node",
        "--format", "cjs"
    ], { stdout: "inherit", stderr: "inherit" });
    await workerProc.exited;

    const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "./package.json"), "utf8"));
    const externals = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
    const externalFlags = externals.flatMap(e => ["--external", e]);

    // Compile each case individually to ensure proper output
    for (const framework of targetFrameworks) {
        const entrypoint = path.join(CASES_DIR, `${framework}.ts`);
        const outfile = path.join(DIST_DIR, `${framework}.cjs`);

        const proc = spawn(["bun", "build",
            entrypoint,
            "--outfile", outfile,
            "--target", "node",
            "--format", "cjs",
            ...externalFlags
        ], { stdout: "inherit", stderr: "inherit" });
        await proc.exited;

        if (proc.exitCode !== 0) {
            console.warn(`Warning: Failed to compile ${framework}.ts for Node.js`);
        }
    }
}

function runAutocannon(url: string, options: any = {}) {
    return new Promise<any>((resolve, reject) => {
        const latencies: number[] = [];
        const config: any = {
            url,
            connections: options.connections || 100,
            duration: options.duration || 10,
            timeout: options.timeout || 10,
        };

        if (options.method) config.method = options.method;
        if (options.body) config.body = options.body;
        if (options.headers) config.headers = options.headers;

        const instance = autocannon(config, (err, result) => {
            if (err) return reject(err);
            (result as any).latencies = latencies;
            resolve(result);
        });

        instance.on('response', (client, statusCode, resBytes, responseTime) => {
            latencies.push(responseTime);
        });
    });
}

function calculatePercentile(latencies: number[], percentile: number): number {
    if (latencies.length === 0) return 0;
    const index = Math.ceil(percentile / 100 * latencies.length) - 1;
    return latencies[Math.max(0, Math.min(latencies.length - 1, index))];
}

async function runBenchmark(framework: string, runtime: string, scenario: string) {
    const port = 3000 + Math.floor(Math.random() * 10000);
    const scenarioConfig = SCENARIOS[scenario as keyof typeof SCENARIOS];

    console.log(`\\n--- Benchmarking ${framework} on ${runtime} for ${scenarioConfig.name} (port ${port}) ---`);

    let cmd: string[];
    let caseFile: string;
    let env = { ...process.env, PORT: String(port), SCENARIO: scenario };

    if (runtime === "bun") {
        cmd = ["bun", "run", WORKER_TS];
        caseFile = path.join(CASES_DIR, `${framework}.ts`);
    } else {
        cmd = ["node", WORKER_JS];
        caseFile = path.join(DIST_DIR, `${framework}.cjs`);
    }
    env['CASE_FILE'] = caseFile;

    const proc = spawn(cmd, {
        env,
        stdout: "pipe",
        stderr: "pipe",
        onExit(proc, exitCode, signalCode, error) {
            const isExpectedSignal = signalCode === 15 || signalCode === 2;
            if (exitCode !== 0 && !isExpectedSignal) {
                console.error(`Process exited unexpectedly with code ${exitCode}, signal ${signalCode}`);
            }
        },
    });

    const outputLines: string[] = [];
    const pipeStream = async (stream: ReadableStream, dest: any) => {
        if (!stream) return;
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value);
                dest.write(text);
                if (outputLines.length < 100) {
                    outputLines.push(text);
                }
            }
        } catch (e) { }
    };

    pipeStream(proc.stdout, process.stdout);
    pipeStream(proc.stderr, process.stderr);

    await new Promise(r => setTimeout(r, 2000));

    if (proc.killed || proc.exitCode !== null) {
        return { error: "Process died immediately", output: outputLines.join("") };
    }

    // Health check
    let serverReady = false;
    let lastError: any = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));

        if (proc.killed || proc.exitCode !== null) {
            return { error: "Process died during startup", output: outputLines.join("") };
        }

        try {
            const testEndpoint = scenarioConfig.endpoints[0];
            const healthCheck = await fetch(`http://localhost:${port}${testEndpoint}`, {
                signal: AbortSignal.timeout(1000),
                method: (scenarioConfig.method as any) || "GET"
            });
            if (healthCheck.ok || healthCheck.status < 500) {
                serverReady = true;
                console.log(`Server is ready on port ${port}`);
                break;
            }
            lastError = `HTTP ${healthCheck.status}`;
        } catch (e: any) {
            lastError = e.message || String(e);
        }
    }

    if (!serverReady) {
        proc.kill();
        await new Promise(r => setTimeout(r, 1000));
        return { error: `Server failed to start: ${lastError}`, output: outputLines.join("") };
    }

    const results: ScenarioResults = {};

    try {
        for (const endpoint of scenarioConfig.endpoints) {
            console.log(`Testing ${endpoint}...`);
            const url = `http://localhost:${port}${endpoint}`;
            try {
                const res = await runAutocannon(url, {
                    connections: scenarioConfig.connections,
                    duration: scenarioConfig.duration,
                    method: scenarioConfig.method,
                    body: scenarioConfig.body,
                    headers: scenarioConfig.headers,
                    timeout: scenarioConfig.timeout
                });

                const latencies = (res.latencies || []).sort((a: number, b: number) => a - b);
                const percentiles = {
                    p1: calculatePercentile(latencies, 1),
                    p5: calculatePercentile(latencies, 5),
                    p25: calculatePercentile(latencies, 25),
                    p75: calculatePercentile(latencies, 75),
                    p95: calculatePercentile(latencies, 95),
                    p99: calculatePercentile(latencies, 99)
                };

                results[endpoint] = {
                    requests: res.requests?.average || 0,
                    latency: res.latency?.average || 0,
                    throughput: res.throughput?.average || 0,
                    percentiles
                };
            } catch (e) {
                console.error(`Failed to benchmark ${endpoint}:`, e);
                results[endpoint] = {
                    requests: 0,
                    latency: 0,
                    throughput: 0,
                    error: String(e)
                };
            }
        }
    } finally {
        proc.kill();
        await new Promise(r => setTimeout(r, 500));
    }

    return results;
}

async function main() {
    console.log("🚀 Advanced Benchmark Suite for Web Frameworks\\n");

    let targetFrameworks = FRAMEWORKS;
    let targetScenarios = Object.keys(SCENARIOS);

    if (filter) {
        if (FRAMEWORKS.includes(filter)) {
            targetFrameworks = [filter];
            console.log(`Filtering frameworks: ${filter}`);
        } else {
            console.error(`Unknown framework: ${filter}. Available: ${FRAMEWORKS.join(", ")}`);
            process.exit(1);
        }
    }

    if (scenarioFilter) {
        if (SCENARIOS[scenarioFilter as keyof typeof SCENARIOS]) {
            targetScenarios = [scenarioFilter];
            console.log(`Filtering scenarios: ${scenarioFilter}`);
        } else {
            console.error(`Unknown scenario: ${scenarioFilter}. Available: ${Object.keys(SCENARIOS).join(", ")}`);
            process.exit(1);
        }
    }

    await compileForNode(targetFrameworks);

    const fullResults: AllResults = {};

    for (const framework of targetFrameworks) {
        fullResults[framework] = {};

        for (const runtime of RUNTIMES) {
            fullResults[framework][runtime] = {};

            for (const scenario of targetScenarios) {
                try {
                    console.log(`\\n${"=".repeat(60)}`);
                    console.log(`Framework: ${framework} | Runtime: ${runtime} | Scenario: ${scenario}`);
                    console.log("=".repeat(60));

                    const res = await runBenchmark(framework, runtime, scenario);
                    fullResults[framework][runtime][scenario] = res as any;
                } catch (e: any) {
                    console.error(`Failed ${framework}/${runtime}/${scenario}:`, e.message);
                    fullResults[framework][runtime][scenario] = {
                        error: e.message || "Failed to run"
                    } as any;
                }
            }
        }
    }

    // Save results
    let history: HistoryEntry[] = [];
    if (fs.existsSync(HISTORY_PATH)) {
        try {
            history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
        } catch (e) {
            console.error("Failed to parse history, starting fresh.");
        }
    }

    const newEntry: HistoryEntry = {
        timestamp: Date.now(),
        results: fullResults
    };

    history.push(newEntry);
    if (history.length > 10) {
        history = history.slice(history.length - 10);
    }

    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

    console.log(`\\n✅ Benchmarks complete! Results saved to ${HISTORY_PATH}`);
    console.log(`📊 Generating HTML report...`);

    generateReport(history);

    console.log(`\\n🎉 Report generated: ${REPORT_PATH}`);

    // Auto-open the report
    const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    spawn([openCmd, REPORT_PATH]);
}

function generateReport(history: HistoryEntry[]) {
    const sortedHistory = [...history].reverse();
    const historyJson = JSON.stringify(sortedHistory);

    // Extract actual scenarios that  were run from the latest entry
    const latest = sortedHistory[0];
    const runScenarios = new Set<string>();
    Object.values(latest.results).forEach(frameworkRes => {
        Object.values(frameworkRes).forEach(runtimeRes => {
            Object.keys(runtimeRes).forEach(scenario => {
                runScenarios.add(scenario);
            });
        });
    });
    const actualScenarios = Array.from(runScenarios);

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Advanced Benchmark Results</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg-color: #1a1b1e;
            --text-color: #e4e5e7;
            --card-bg: #25262b;
            --border-color: #373a40;
            --primary-color: #339af0;
            --success-color: #51cf66;
            --accent-color: #cc5de8;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 20px;
        }

        .container {
            max-width: 1600px;
            margin: 0 auto;
        }

        h1 {
            background: linear-gradient(45deg, var(--primary-color), var(--success-color));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }

        .subtitle {
            color: #909296;
            margin-bottom: 20px;
        }

        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .tab {
            padding: 10px 20px;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            cursor: pointer;
            color: var(--text-color);
            transition: all 0.2s;
        }

        .tab:hover {
            background: #2c2e33;
            border-color: var(--primary-color);
        }

        .tab.active {
            background: var(--primary-color);
            color: white;
            border-color: var(--primary-color);
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        .chart-container {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            height: 400px;
        }

        h2 {
            color: var(--primary-color);
            margin-bottom: 15px;
        }

        .table-container {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            overflow: hidden;
            margin-top: 20px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 12px 16px;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }

        th {
            background: #2c2e33;
            color: var(--primary-color);
            font-weight: 600;
            font-size: 0.9rem;
        }

        tr:last-child td { border-bottom: none; }
        tr:hover td { background: rgba(255,255,255,0.03); }

        .error {
            color: #fa5252;
            font-style: italic;
        }

        .success {
            color: var(--success-color);
        }

        .metric {
            font-family: 'Monaco', 'Courier New', monospace;
            background: rgba(51, 154, 240, 0.1);
            padding: 2px 6px;
            border-radius: 3px;
            color: var(--primary-color);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Advanced Benchmark Results</h1>
        <p class="subtitle">Comprehensive framework performance analysis across advanced scenarios</p>
        
        <div class="tabs" id="tabs"></div>
        <div id="content"></div>
    </div>

    <script>
        const data = ${historyJson};
        const actualScenarios = ${JSON.stringify(actualScenarios)};
        const allScenarios = ${JSON.stringify(Object.keys(SCENARIOS))};
        const scenarioNames = ${JSON.stringify(Object.fromEntries(Object.entries(SCENARIOS).map(([k, v]) => [k, v.name])))};
        
        if (data.length === 0) {
            document.getElementById('content').innerHTML = '<p>No benchmark data available yet. Run the benchmarks first!</p>';
        } else {
            const latest = data[0].results;
            
            // Create tabs only for scenarios that were run
            const tabsContainer = document.getElementById('tabs');
            const contentContainer = document.getElementById('content');
            
            actualScenarios.forEach((scenario, index) => {
                const tab = document.createElement('button');
                tab.className = 'tab' + (index === 0 ? ' active' : '');
                tab.textContent = scenarioNames[scenario] || scenario;
                tab.onclick = (e) => showScenario(scenario, e);
                tabsContainer.appendChild(tab);
                
                const content = document.createElement('div');
                content.className = 'tab-content' + (index === 0 ? ' active' : '');
                content.id = \`scenario-\${scenario}\`;
                contentContainer.appendChild(content);
            });
            
            function showScenario(scenario, event) {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                event.target.classList.add('active');
                document.getElementById(\`scenario-\${scenario}\`).classList.add('active');
            }
            
            // Populate each scenario's table and optional chart
            actualScenarios.forEach(scenario => {
                const container = document.getElementById(\`scenario-\${scenario}\`);
                let html = \`<h2>\${scenarioNames[scenario] || scenario}</h2>\`;
                
                // Add chart for scaling scenario
                if (scenario === 'scaling') {
                    html += '<div class="chart-container"><canvas id="scalingChart"></canvas></div>';
                }
                
                html += '<div class="table-container"><table><thead><tr>';
                html += '<th>Framework</th><th>Runtime</th><th>Endpoint</th>';
                html += '<th>Req/s</th><th>Latency (ms)</th><th>Throughput (MB/s)</th>';
                html += '<th>P95 (ms)</th><th>P99 (ms)</th><th>Status</th></tr></thead><tbody>';
                
                Object.entries(latest).forEach(([framework, runtimes]) => {
                    Object.entries(runtimes).forEach(([runtime, scenarios]) => {
                        const scenarioData = scenarios[scenario];
                        
                        if (scenarioData && scenarioData.error) {
                            html += \`<tr><td>\${framework}</td><td>\${runtime}</td><td colspan="6"><span class="error">\${scenarioData.error}</span></td><td class="error">FAILED</td></tr>\`;
                        } else if (scenarioData) {
                            Object.entries(scenarioData).forEach(([endpoint, result]) => {
                                if (result.error) {
                                    html += \`<tr><td>\${framework}</td><td>\${runtime}</td><td>\${endpoint}</td>\`;
                                    html += \`<td colspan="5"><span class="error">\${result.error}</span></td><td class="error">FAILED</td></tr>\`;
                                } else {
                                    html += \`<tr><td>\${framework}</td><td>\${runtime}</td><td>\${endpoint}</td>\`;
                                    html += \`<td><span class="metric">\${result.requests.toFixed(0)}</span></td>\`;
                                    html += \`<td><span class="metric">\${result.latency.toFixed(2)}</span></td>\`;
                                    html += \`<td><span class="metric">\${(result.throughput / 1024 / 1024).toFixed(2)}</span></td>\`;
                                    html += \`<td><span class="metric">\${result.percentiles?.p95?.toFixed(2) || 'N/A'}</span></td>\`;
                                    html += \`<td><span class="metric">\${result.percentiles?.p99?.toFixed(2) || 'N/A'}</span></td>\`;
                                    html += \`<td class="success">✓ OK</td></tr>\`;
                                }
                            });
                        }
                    });
                });
                
                html += '</tbody></table></div>';
                container.innerHTML = html;
                
                // Create chart for scaling scenario after HTML is rendered
                if (scenario === 'scaling') {
                    setTimeout(() => createScalingChart(latest), 100);
                }
            });
            
            function createScalingChart(latest) {
                const chartData = {};
                const colors = {
                    'shokupan': '#339af0',
                    'fastify': '#51cf66',
                    'express': '#ff6b6b',
                    'koa': '#ffd43b',
                    'hapi': '#da77f2',
                    'nest': '#ff922b',
                    'hono': '#63e6be',
                    'elysia': '#cc5de8'
                };
                
                Object.entries(latest).forEach(([framework, runtimes]) => {
                    Object.entries(runtimes).forEach(([runtime, scenarios]) => {
                        const scalingData = scenarios['scaling'];
                        if (scalingData && !scalingData.error) {
                            const key = \`\${framework} (\${runtime})\`;
                            const avgReqs = Object.values(scalingData)
                                .filter(r => !r.error && r.requests)
                                .reduce((sum, r) => sum + r.requests, 0) / Object.keys(scalingData).length;
                            
                            if (avgReqs > 0) {
                                chartData[key] = {
                                    requests: avgReqs,
                                    color: colors[framework] || '#909296'
                                };
                            }
                        }
                    });
                });
                
                const ctx = document.getElementById('scalingChart');
                if (ctx) {
                    new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: Object.keys(chartData),
                            datasets: [{
                                label: 'Requests per Second',
                                data: Object.values(chartData).map(d => d.requests),
                                backgroundColor: Object.values(chartData).map(d => d.color),
                                borderColor: Object.values(chartData).map(d => d.color),
                                borderWidth: 2
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: false
                                },
                                title: {
                                    display: true,
                                    text: 'Framework Performance Comparison (1000 Route Handlers)',
                                    color: '#e4e5e7',
                                    font: { size: 16 }
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    title: {
                                        display: true,
                                        text: 'Requests/sec',
                                        color: '#909296'
                                    },
                                    ticks: { color: '#909296' },
                                    grid: { color: '#373a40' }
                                },
                                x: {
                                    ticks: { color: '#909296' },
                                    grid: { color: '#373a40' }
                                }
                            }
                        }
                    });
                }
            }
        }
    </script>
</body>
</html>
`;

    fs.writeFileSync(REPORT_PATH, html);
}

main().catch(console.error);
