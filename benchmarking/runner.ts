import * as clack from "@clack/prompts";
import autocannon from "autocannon";
import { spawn } from "bun";
import fs from "fs";
import path from "path";
import { BUN_ONLY_FRAMEWORKS, FRAMEWORKS, RUNTIMES } from "./config.ts";

// We will use a system command to open the browser.


const ENDPOINTS = ["static", "json", "dynamic/123"];


const CASES_DIR = path.join(import.meta.dir, "cases");
const DIST_DIR = path.join(import.meta.dir, "dist");
const WORKER_TS = path.join(import.meta.dir, "worker.ts");
const WORKER_JS = path.join(DIST_DIR, "worker.cjs");
const REPORT_PATH = path.join(import.meta.dir, "report.html");
const HISTORY_PATH = path.join(import.meta.dir, "benchmark-results.json");

type BenchmarkResult = {
    requests: number;
    latency: number;
    throughput: number;
    error?: string;
    percentiles?: Record<string, number>;
};

type RuntimeResults = Record<string, Record<string, BenchmarkResult>>; // runtime -> endpoint -> result
type FrameworkResults = Record<string, RuntimeResults>; // framework -> runtime -> endpoint -> result

type HistoryEntry = {
    timestamp: number;
    results: FrameworkResults;
};


async function compileForNode(targetFrameworks: string[]) {
    console.log("Compiling cases for Node.js...");
    if (fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true });
    }
    fs.mkdirSync(DIST_DIR);

    // Compile worker
    const workerProc = spawn(["bun", "build",
        WORKER_TS,
        "--outfile", path.join(DIST_DIR, "worker.cjs"),
        "--target", "node",
        "--format", "cjs"
    ], { stdout: "inherit", stderr: "inherit" });
    await workerProc.exited;

    const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "./package.json"), "utf8"));
    const externals = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
    const externalFlags = externals.flatMap(e => ["--external", e]);

    // Compile cases
    const entrypoints = targetFrameworks.map(f => path.join(CASES_DIR, `${f}.ts`));
    const casesProc = spawn(["bun", "build",
        ...entrypoints,
        "--outdir", DIST_DIR,
        "--target", "node",
        "--format", "cjs",
        "--entry-naming", "[dir]/[name].cjs",
        ...externalFlags
    ], { stdout: "inherit", stderr: "inherit" });
    await casesProc.exited;
}

function runAutocannon(url: string) {
    return new Promise<any>((resolve, reject) => {
        const latencies: number[] = [];
        const instance = autocannon({
            url,
            connections: 100,
            duration: 5,
        }, (err, result) => {
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
    // Autocannon latencies are not necessarily sorted? Documentation implies array of all latencies. To be safe, sort them.
    // Actually, sorting huge array might be slow but for 5s run with 100 conns it might be manageable (~100k-1M reqs?)
    // 100k requests array sort is fine.

    // Sort logic should happen once if possible, but calculating multiple percentiles means we can sort once.
    // We'll sort in runBenchmark.
    const index = Math.ceil(percentile / 100 * latencies.length) - 1;
    return latencies[Math.max(0, Math.min(latencies.length - 1, index))];
}

async function runBenchmark(framework: string, runtime: string) {
    const port = 3000 + Math.floor(Math.random() * 10000);
    console.log(`\n--- Benchmarking ${framework} on ${runtime} (port ${port}) ---`);

    let cmd: string[];
    let caseFile: string;
    let env = { ...process.env, PORT: String(port) };

    if (runtime === "bun") {
        cmd = ["bun", "run", WORKER_TS];
        caseFile = path.join(CASES_DIR, `${framework}.ts`);
    } else if (runtime === "deno") {
        cmd = ["deno", "run", "--allow-all", "--unstable-sloppy-imports", "--node-modules-dir", WORKER_TS];
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
                if (error) console.error(`Error: ${error}`);
            }
        },
    });

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

    const outputLines: string[] = [];
    pipeStream(proc.stdout, process.stdout);
    pipeStream(proc.stderr, process.stderr);

    await new Promise(r => setTimeout(r, 1500));

    if (proc.killed || proc.exitCode !== null) {
        return { error: "Process died immediately" };
    }

    let serverReady = false;
    let lastError: any = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));

        if (proc.killed || proc.exitCode !== null) {
            return { error: "Process died during startup" };
        }

        try {
            const healthCheck = await fetch(`http://localhost:${port}/static`, {
                signal: AbortSignal.timeout(1000)
            });
            if (healthCheck.ok) {
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
        return { error: `Server failed to start: ${lastError}` };
    }

    const results: Record<string, any> = {};

    try {
        for (const endpoint of ENDPOINTS) {
            console.log(`Testing /${endpoint}...`);
            const url = `http://localhost:${port}/${endpoint}`;
            try {
                const res = await runAutocannon(url);

                // Calculate custom percentiles from raw latencies
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
                    requests: res.requests.average,
                    latency: res.latency.average,
                    throughput: res.throughput.average,
                    percentiles
                };
            } catch (e) {
                console.error(`Failed to benchmark ${endpoint}:`, e);
                results[endpoint] = { error: String(e) };
            }
        }
    } finally {
        proc.kill();
        await new Promise(r => setTimeout(r, 500));
    }

    return results;
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes("--report-only")) {
        console.log("Generating report from existing history...");
        let history: HistoryEntry[] = [];
        if (fs.existsSync(HISTORY_PATH)) {
            try {
                history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
            } catch (e) {
                console.error("Failed to parse history.");
            }
        }
        generateReport(history);
        return;
    }

    const hasAllFlag = args.includes("--all");

    if (!hasAllFlag) {
        clack.intro("🚀 Basic Benchmark Suite for Web Frameworks");
    }

    let targetFrameworks: string[];

    const filterIndex = args.indexOf("--filter");
    const hasFilterArg = filterIndex !== -1;

    if (hasAllFlag) {
        // Run all frameworks non-interactively (for CI/CD)
        targetFrameworks = FRAMEWORKS;
        console.log("Running full benchmark suite for all frameworks...");
    } else if (hasFilterArg) {
        // Legacy CLI mode
        const filter = args[filterIndex + 1];
        if (FRAMEWORKS.includes(filter)) {
            targetFrameworks = [filter];
            console.log(`Running benchmarks only for: ${filter}`);
        } else {
            console.error(`Unknown framework: ${filter}. Available: ${FRAMEWORKS.join(", ")}`);
            process.exit(1);
        }
    } else {
        // Interactive mode
        const frameworkSelection = await clack.multiselect({
            message: "Select frameworks to benchmark:",
            options: FRAMEWORKS.map(f => ({ value: f, label: f })),
            initialValues: ["shokupan"],
            required: true
        });

        if (clack.isCancel(frameworkSelection)) {
            clack.cancel("Benchmark cancelled.");
            process.exit(0);
        }

        targetFrameworks = frameworkSelection as string[];
    }

    // Calculate time estimate
    // Basic benchmark: 3 endpoints × 2 runtimes × 5s duration + ~5-8s startup/teardown per test
    const totalTests = targetFrameworks.length * RUNTIMES.length;
    const avgTimePerTest = ENDPOINTS.length * 5 + 8; // ~23 seconds per framework-runtime pair
    const estimatedSeconds = Math.ceil(totalTests * avgTimePerTest);
    const estimatedMinutes = Math.floor(estimatedSeconds / 60);
    const remainingSeconds = estimatedSeconds % 60;

    const timeEstimate = estimatedMinutes > 0
        ? `${estimatedMinutes} minute${estimatedMinutes !== 1 ? 's' : ''}${remainingSeconds > 0 ? ` ${remainingSeconds}s` : ''}`
        : `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;

    if (hasAllFlag) {
        // Non-interactive mode for CI/CD
        console.log(`\nFrameworks: ${targetFrameworks.join(", ")}`);
        console.log(`Endpoints: ${ENDPOINTS.join(", ")}`);
        console.log(`Total tests: ${totalTests} (${targetFrameworks.length} frameworks × ${RUNTIMES.length} runtimes)`);
        console.log(`Estimated duration: ${timeEstimate}\n`);
    } else {
        // Interactive mode with confirmation
        clack.note(
            `Frameworks: ${targetFrameworks.join(", ")}\n` +
            `Endpoints: ${ENDPOINTS.join(", ")}\n` +
            `Total tests: ${totalTests} (${targetFrameworks.length} frameworks × ${RUNTIMES.length} runtimes)\n` +
            `Estimated duration: ${timeEstimate}`,
            "Benchmark Configuration"
        );

        const shouldContinue = await clack.confirm({
            message: "Start benchmarking?",
            initialValue: true
        });

        if (clack.isCancel(shouldContinue) || !shouldContinue) {
            clack.cancel("Benchmark cancelled.");
            process.exit(0);
        }
    }

    const s = clack.spinner();
    s.start("Starting benchmarks...");

    await compileForNode(targetFrameworks);
    s.message("Compilation complete");

    const fullResults: FrameworkResults = {};

    for (const framework of targetFrameworks) {
        fullResults[framework] = {};
        for (const runtime of RUNTIMES) {
            // Skip Bun-only frameworks on Node.js
            if (runtime === "node" && BUN_ONLY_FRAMEWORKS.includes(framework)) {
                console.log(`Skipping ${framework} on ${runtime} (Bun-only framework)`);
                fullResults[framework][runtime] = {
                    error: "Skipped - Bun-only framework"
                } as any;
                continue;
            }

            try {
                s.message(`${framework} on ${runtime}`);
                const res = await runBenchmark(framework, runtime);
                fullResults[framework][runtime] = res as any;
            } catch (e) {
                console.error(`Total failure for ${framework} on ${runtime}:`, e);
                fullResults[framework][runtime] = { error: "Failed to run" } as any;
            }
        }
    }

    s.stop("Benchmarks complete!");

    // Load History
    let history: HistoryEntry[] = [];
    if (fs.existsSync(HISTORY_PATH)) {
        try {
            history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
        } catch (e) {
            console.error("Failed to parse history, starting fresh.");
        }
    }

    // Append new result
    const newEntry: HistoryEntry = {
        timestamp: Date.now(),
        results: fullResults
    };

    // If filtering, merge with latest full run if possible, or just add a partial run.
    // For simplicity, we'll just push this run.
    // However, for the report to show "best", mixing partial runs might be tricky if we compare across runs.
    // Let's just push it. If it's a filtered run, other frameworks will be missing from this entry.
    history.push(newEntry);

    // Keep last 10
    if (history.length > 10) {
        history = history.slice(history.length - 10);
    }

    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

    clack.log.success(`Results saved to ${HISTORY_PATH}`);

    s.start("Generating HTML report...");
    generateReport(history, hasAllFlag);
    s.stop(`Report generated: ${REPORT_PATH}`);

    clack.outro("✨ All done!");
    process.exit(0);
}

function generateReport(history: HistoryEntry[], skipAutoOpen = false) {
    // We reverse history so index 0 is the Latest
    const sortedHistory = [...history].reverse();
    // Embed the data for client-side processing
    const historyJson = JSON.stringify(sortedHistory);

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Benchmark Results</title>
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
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
            background-color: #22355a;
        }

        ::-webkit-scrollbar-thumb {
            border-radius: 10px;
            background-color: #2a406a;
            box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.3);
        }

        *:hover::-webkit-scrollbar-thumb {
            background-color: #22468a;
        }

        ::-webkit-scrollbar-track {
            border-radius: 10px;
            background-color: #0b0f17;
        }

        ::-webkit-scrollbar-corner {
            box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.3);
        }
        body {
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        h1 {
            background: linear-gradient(45deg, var(--primary-color), var(--success-color));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 20px;
        }

        .controls {
            background: var(--card-bg);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
            margin-bottom: 20px;
            display: flex;
            gap: 20px;
            align-items: center;
            flex-wrap: wrap;
        }

        .control-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        label {
            font-size: 0.9rem;
            color: #909296;
            font-weight: 600;
        }

        select {
            background: var(--bg-color);
            color: var(--text-color);
            border: 1px solid var(--border-color);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 1rem;
            min-width: 200px;
        }

        .charts-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 40px;
        }

        .chart-container {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 15px;
            position: relative;
            height: 350px;
            padding-bottom: 50px;
        }
        
        .chart-container.full-width {
            grid-column: span 2;
        }

        h3 {
            margin: 0 0 10px 0;
            font-size: 1.1rem;
            color: #c1c2c5;
        }

        /* Table styles */
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

    </style>
</head>
<body>
    <div class="container">
        <h1>Benchmark Report</h1>
        
        <div class="controls">
            <div class="control-group">
                <label>Endpoint (Request Name)</label>
                <select id="endpointFilter">
                     <option value="all">All (Average)</option>
                </select>
            </div>
            <div class="control-group">
                <label>Compare Runtime</label>
                <select id="runtimeFilter">
                    <option value="all">All (Bun vs Node vs Deno)</option>
                    <option value="bun">Bun Only</option>
                    <option value="node">Node Only</option>
                    <option value="deno">Deno Only</option>
                </select>
            </div>
        </div>

        <div class="charts-grid">
            <div class="chart-container">
                <h3>Requests / Second (Higher is better)</h3>
                <canvas id="reqSecChart"></canvas>
            </div>
            <div class="chart-container">
                <h3>Throughput (MB/s) (Higher is better)</h3>
                <canvas id="throughputChart"></canvas>
            </div>
            <div class="chart-container full-width">
                 <h3>Latency Percentiles (Lower is better)</h3>
                 <canvas id="percentileChart"></canvas>
            </div>
            <div class="chart-container full-width">
                 <h3>Latency Spread (Consistency) - Lower is better</h3>
                 <canvas id="spreadChart"></canvas>
            </div>
            <div class="chart-container full-width">
                 <h3>Runtime Comparison (Bun vs Node) - Req/Sec</h3>
                 <canvas id="runtimeCompChart"></canvas>
            </div>
             <div class="chart-container full-width">
                 <h3>Run-to-Run Trend (Req/Sec Delta)</h3>
                 <canvas id="trendChart"></canvas>
            </div>
        </div>
        
        <h3>Detailed Results (Latest Run)</h3>
        <div class="table-container">
            <table id="detailsTable">
                <thead>
                    <tr>
                        <th>Framework</th>
                        <th>Runtime</th>
                        <th>Endpoint</th>
                        <th>Req/s</th>
                        <th>Avg Latency (ms)</th>
                        <th>Throughput (MB/s)</th>
                        <th>P1</th>
                        <th>P5</th>
                        <th>P25</th>
                        <th>P75</th>
                        <th>P95</th>
                        <th>P99</th>
                        <th>Spread (P95-P5)</th>
                        <th>Tail (P99-P1)</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>

    </div>

    <script>
        const historyData = ${historyJson};
        
        // Designated colors for frameworks
        const frameworkColors = {
            'shokupan': '#339af0', // Blue
            'fastify': '#20c997',  // Teal
            'express': '#ff6b6b',  // Red
            'koa': '#845ef7',      // Violet
            'hapi': '#fcc419',     // Yellow
            'nest': '#ff922b',     // Orange
            'hono': '#fd7e14',     // OrangeRed
            'elysia': '#cc5de8',   // Grape
            'default': '#adb5bd'   // Grey
        };
        
        function getColor(framework, runtime, options = {}) {
            const base = frameworkColors[framework] || frameworkColors['default'];
            if (runtime === 'bun') {
                 return options.opacity ? addAlpha(base, options.opacity) : base;
            } else if (runtime === 'deno') {
                 return addAlpha(base, 0.7);
            } else {
                 return addAlpha(base, 0.4); 
            }
        }
        
        function getBorderColor(framework, runtime) {
             const base = frameworkColors[framework] || frameworkColors['default'];
             return base;
        }

        function addAlpha(color, opacity) {
            let c = color.substring(1).split('');
            if(c.length== 3){
                c= [c[0], c[0], c[1], c[1], c[2], c[2]];
            }
            c= '0x'+c.join('');
            return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+opacity+')';
        }

        // State
        let currentEndpoint = 'all';
        let currentRuntimeFilter = 'all';
        
        // Chart instances
        let charts = {};

        function init() {
            // Populate Endpoint Filter
            const latest = historyData[0];
            const endpoints = new Set();
            
            Object.values(latest.results).forEach(frameworkRes => {
                Object.values(frameworkRes).forEach(runtimeRes => {
                    if (runtimeRes.error) return;
                    Object.keys(runtimeRes).forEach(ep => {
                        if (ep !== 'error' && ep !== 'requests' && ep !== 'latency' && ep !== 'throughput' && ep !== 'percentiles') {
                            if (typeof runtimeRes[ep] === 'object') {
                                endpoints.add(ep);
                            }
                        }
                    });
                });
            });
            
            const epSelect = document.getElementById('endpointFilter');
            const sortedEndpoints = Array.from(endpoints).sort();
            
            sortedEndpoints.forEach(ep => {
                const opt = document.createElement('option');
                opt.value = ep;
                opt.innerText = ep;
                epSelect.appendChild(opt);
            });
            
            // Event Listeners
            epSelect.addEventListener('change', (e) => {
                currentEndpoint = e.target.value;
                updateView();
            });
            
            document.getElementById('runtimeFilter').addEventListener('change', (e) => {
                currentRuntimeFilter = e.target.value;
                updateView();
            });
            
            updateView();
        }

        function updateView() {
            updateReqSecChart();
            updateThroughputChart();
            updatePercentileChart();
            updateSpreadChart();
            updateRuntimeCompChart();
            updateTrendChart();
            updateTable();
        }
        
        function getLatestDataForEndpoint(endpointFilter) {
           const latest = historyData[0];
           const data = [];
           
           Object.entries(latest.results).forEach(([fwName, fwRes]) => {

               const runtimes = currentRuntimeFilter === 'all' ? ['bun', 'node', 'deno'] : [currentRuntimeFilter];
               
               runtimes.forEach(rt => {
                   const runtimeRes = fwRes[rt];
                   if (!runtimeRes || runtimeRes.error) return;

                   let metric = { 
                       requests: 0, 
                       latency: 0, 
                       throughput: 0, 
                       count: 0,
                       percentiles: { p1:0, p5:0, p25:0, p75:0, p95:0, p99:0 }
                   };
                   
                   if (endpointFilter === 'all') {
                       // Average across all found endpoints
                       Object.keys(runtimeRes).forEach(key => {
                            if (key !== 'error' && typeof runtimeRes[key] === 'object' && key !== 'percentiles') {
                                const val = runtimeRes[key];
                                metric.requests += val.requests || 0;
                                metric.latency += val.latency || 0;
                                metric.throughput += val.throughput || 0;
                                
                                if (val.percentiles) {
                                    Object.keys(metric.percentiles).forEach(p => {
                                        metric.percentiles[p] += val.percentiles[p] || 0;
                                    });
                                }
                                
                                metric.count++;
                            }
                       });
                       if (metric.count > 0) {
                           metric.requests /= metric.count;
                           metric.latency /= metric.count;
                           metric.throughput /= metric.count;
                           Object.keys(metric.percentiles).forEach(p => {
                               metric.percentiles[p] /= metric.count;
                           });
                       }
                   } else {
                       const res = runtimeRes[endpointFilter];
                       if (res) {
                           metric.requests = res.requests;
                           metric.latency = res.latency;
                           metric.throughput = res.throughput;
                           if (res.percentiles) {
                               metric.percentiles = { ...res.percentiles };
                           }
                       } else {
                           return; // Endpoint doesn't exist for this fw
                       }
                   }
                   
                   data.push({
                       framework: fwName,
                       runtime: rt,
                       requests: metric.requests,
                       latency: metric.latency,
                       throughput: metric.throughput,
                       percentiles: metric.percentiles
                   });
               });
           });
           
           return data.sort((a, b) => b.requests - a.requests);
        }

        function createOrUpdateChart(id, type, config) {
            const ctx = document.getElementById(id).getContext('2d');
            if (charts[id]) { charts[id].destroy(); }
            
            charts[id] = new Chart(ctx, {
                type: type,
                data: config.data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#c1c2c5' } } },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: '#373a40' },
                            ticks: { color: '#909296' }
                        },
                        x: {
                            grid: { color: '#373a40' },
                            ticks: { color: '#909296' }
                        }
                    },
                    ...config.options
                }
            });
        }

        function updateReqSecChart() {
            const data = getLatestDataForEndpoint(currentEndpoint);
            
            const labels = data.map(d => \`\${d.framework} (\${d.runtime})\`);
            const values = data.map(d => d.requests);
            
            const bgColors = data.map(d => getColor(d.framework, d.runtime));
            const borderColors = data.map(d => getBorderColor(d.framework, d.runtime));

            createOrUpdateChart('reqSecChart', 'bar', {
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Requests / Second',
                        data: values,
                        backgroundColor: bgColors,
                        borderColor: borderColors,
                        borderWidth: 2
                    }]
                }
            });
        }

        function updateThroughputChart() {
             const data = getLatestDataForEndpoint(currentEndpoint);
            
            const labels = data.map(d => \`\${d.framework} (\${d.runtime})\`);
            const values = data.map(d => d.throughput / (1024 * 1024));
            
            const bgColors = data.map(d => getColor(d.framework, d.runtime));
            const borderColors = data.map(d => getBorderColor(d.framework, d.runtime));

            createOrUpdateChart('throughputChart', 'bar', {
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Throughput (MB/s)',
                        data: values,
                        backgroundColor: bgColors,
                        borderColor: borderColors,
                        borderWidth: 2
                    }]
                }
            });
        }
        
        function updatePercentileChart() {
            const data = getLatestDataForEndpoint(currentEndpoint);
            // This chart will have specific percentiles on X axis, and lines for each framework
            // X Axis: P1, P5, P25, P75, P95, P99
            
            const percentiles = ['p1', 'p5', 'p25', 'p75', 'p95', 'p99'];
            const labels = ['1%', '5%', '25%', '75%', '95%', '99%'];
            
            const datasets = data.map(d => {
                const pData = percentiles.map(p => d.percentiles[p] || 0);
                let borderDash = [];
                if (d.runtime === 'node') borderDash = [5, 5];
                if (d.runtime === 'deno') borderDash = [2, 2];
                return {
                    label: \`\${d.framework} (\${d.runtime})\`,
                    data: pData,
                    borderColor: getBorderColor(d.framework, d.runtime),
                    backgroundColor: getColor(d.framework, d.runtime),
                    borderDash: borderDash,
                    tension: 0.1,
                    fill: false
                };
            });
            
            createOrUpdateChart('percentileChart', 'line', {
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                     scales: {
                        y: {
                            title: { display: true, text: 'Latency (ms)', color: '#909296' }
                        }
                    }
                }
            });
        }
        
        function updateSpreadChart() {
             const data = getLatestDataForEndpoint(currentEndpoint);
             
             // Two datasets: P95-P5 and P99-P1
             const labels = data.map(d => \`\${d.framework} (\${d.runtime})\`);
             
             const spreadCore = data.map(d => (d.percentiles.p95 - d.percentiles.p5));
             const spreadTail = data.map(d => (d.percentiles.p99 - d.percentiles.p1));
             
             createOrUpdateChart('spreadChart', 'bar', {
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Core Spread (P95 - P5)',
                            data: spreadCore,
                            backgroundColor: data.map(d => addAlpha(getColor(d.framework, d.runtime, {opacity: 1}), 0.8)),
                            borderColor: data.map(d => getBorderColor(d.framework, d.runtime)),
                            borderWidth: 1
                        },
                         {
                            label: 'Tail Spread (P99 - P1)',
                            data: spreadTail,
                            backgroundColor: data.map(d => addAlpha(getColor(d.framework, d.runtime, {opacity: 1}), 0.3)), // Faded for tail
                            borderColor: data.map(d => getBorderColor(d.framework, d.runtime)),
                            borderWidth: 1
                        }
                    ]
                }
             });
        }
        
        function updateRuntimeCompChart() {
            const latest = historyData[0];
            const frameworks = Object.keys(latest.results).sort(); 
            
            const bunData = [];
            const nodeData = [];
            const denoData = [];
            
            const getVal = (fw, rt) => {
                 const res = latest.results[fw]?.[rt];
                 if (!res || res.error) return 0;
                 if (currentEndpoint === 'all') {
                     let total = 0, count = 0;
                      Object.keys(res).forEach(key => {
                            if (key !== 'error' && typeof res[key] === 'object' && key !== 'percentiles') {
                                total += res[key].requests || 0;
                                count++;
                            }
                       });
                       return count ? total/count : 0;
                 }
                 return res[currentEndpoint]?.requests || 0;
            };

            frameworks.forEach(fw => {
                bunData.push(getVal(fw, 'bun'));
                nodeData.push(getVal(fw, 'node'));
                denoData.push(getVal(fw, 'deno'));
            });
            
            const bunColors = frameworks.map(fw => getColor(fw, 'bun'));
            const bunBorders = frameworks.map(fw => getBorderColor(fw, 'bun'));
            
            const nodeColors = frameworks.map(fw => getColor(fw, 'node'));
            const nodeBorders = frameworks.map(fw => getBorderColor(fw, 'node'));

            const denoColors = frameworks.map(fw => getColor(fw, 'deno'));
            const denoBorders = frameworks.map(fw => getBorderColor(fw, 'deno'));

            createOrUpdateChart('runtimeCompChart', 'bar', {
                data: {
                    labels: frameworks,
                    datasets: [
                        { 
                            label: 'Bun', 
                            data: bunData, 
                            backgroundColor: bunColors,
                            borderColor: bunBorders,
                            borderWidth: 2
                        },
                        { 
                            label: 'Node', 
                            data: nodeData, 
                            backgroundColor: nodeColors,
                            borderColor: nodeBorders,
                            borderWidth: 2,
                        },
                        { 
                            label: 'Deno', 
                            data: denoData, 
                            backgroundColor: denoColors,
                            borderColor: denoBorders,
                            borderWidth: 2,
                        }
                    ]
                }
            });
        }
        
        function updateTrendChart() {
            const chronoHistory = [...historyData].reverse();
            const labels = chronoHistory.map(h => new Date(h.timestamp).toLocaleTimeString());
            const datasets = [];
            
            const combinations = [];
            const latest = historyData[0];
            Object.keys(latest.results).forEach(fw => {
                 ['bun', 'node', 'deno'].forEach(rt => {
                     if (currentRuntimeFilter !== 'all' && currentRuntimeFilter !== rt) return;
                     combinations.push({ fw, rt });
                 });
            });
            
            combinations.forEach((combo, idx) => {
                const dataPoints = chronoHistory.map(entry => {
                    const res = entry.results[combo.fw]?.[combo.rt];
                    if (!res) return null;
                    
                    if (currentEndpoint === 'all') {
                         let total = 0, count = 0;
                         Object.keys(res).forEach(key => {
                            if (key !== 'error' && typeof res[key] === 'object' && key !== 'percentiles') {
                                total += res[key].requests || 0;
                                count++;
                            }
                       });
                       return count ? total/count : null;
                    }
                    return res[currentEndpoint]?.requests || null;
                });
                
                let borderDash = [];
                if (combo.rt === 'node') borderDash = [5, 5];
                if (combo.rt === 'deno') borderDash = [2, 2];
                
                datasets.push({
                    label: \`\${combo.fw} (\${combo.rt})\`,
                    data: dataPoints,
                    borderColor: getBorderColor(combo.fw, combo.rt),
                    backgroundColor: getColor(combo.fw, combo.rt),
                    borderDash: borderDash,
                    tension: 0.3,
                    fill: false
                });
            });

            createOrUpdateChart('trendChart', 'line', {
                data: {
                    labels: labels,
                    datasets: datasets
                }
            });
        }
        
        function updateTable() {
             const data = getLatestDataForEndpoint(currentEndpoint);
             const tbody = document.querySelector('#detailsTable tbody');
             tbody.innerHTML = '';
             
             if (data.length === 0) {
                 tbody.innerHTML = '<tr><td colspan="12">No data found</td></tr>';
                 return;
             }
             
             data.forEach(row => {
                 const tr = document.createElement('tr');
                 const color = getColor(row.framework, row.runtime);
                 const style = \`display:inline-block;width:10px;height:10px;background:\${color};border-radius:50%;margin-right:8px;\`;
                 const p = row.percentiles || {};
                 const spreadCore = (p.p95 - p.p5) || 0;
                 const spreadTail = (p.p99 - p.p1) || 0;
                 
                 tr.innerHTML = \`
                    <td><span style="\${style}"></span> \${row.framework}</td>
                    <td>\${row.runtime}</td>
                    <td>\${currentEndpoint}</td>
                    <td>\${row.requests.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td>\${row.latency.toFixed(2)}</td>
                    <td>\${(row.throughput / (1024 * 1024)).toFixed(2)}</td>
                    <td>\${p.p1?.toFixed(2) || '-'}</td>
                    <td>\${p.p5?.toFixed(2) || '-'}</td>
                    <td>\${p.p25?.toFixed(2) || '-'}</td>
                    <td>\${p.p75?.toFixed(2) || '-'}</td>
                    <td>\${p.p95?.toFixed(2) || '-'}</td>
                    <td>\${p.p99?.toFixed(2) || '-'}</td>
                    <td>\${spreadCore.toFixed(2)} ms</td>
                    <td>\${spreadTail.toFixed(2)} ms</td>
                 \`;
                 tbody.appendChild(tr);
             });
        }

        // Run
        init();

    </script>
</body>
</html>`;


    fs.writeFileSync(REPORT_PATH, html);
    console.log(`Report generated at ${REPORT_PATH}`);

    // Only auto-open in interactive mode (not in CI/CD)
    if (!skipAutoOpen) {
        const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
        spawn([openCmd, REPORT_PATH]);
    }
}

main();

