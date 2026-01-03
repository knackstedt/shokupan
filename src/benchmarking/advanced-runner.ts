import * as clack from "@clack/prompts";
import autocannon from "autocannon";
import { spawn } from "bun";
import fs from "fs";
import getPort from "get-port";
import ora from "ora";
import path from "path";

const FRAMEWORKS = ["shokupan", "fastify", "express", "koa", "hapi", "nest", "hono", "elysia"];
const RUNTIMES = ["bun", "node"];
const BUN_ONLY_FRAMEWORKS = ["elysia"]; // Frameworks that only work on Bun

// Framework/scenario exclusions - scenarios that frameworks don't support
const FRAMEWORK_EXCLUSIONS: Record<string, string[]> = {
    "express": ["compression-brotli", "compression-zstd"],
    "koa": ["compression-brotli", "compression-zstd"],
    "hapi": ["compression-brotli", "compression-zstd"],
    "nest": ["compression-gzip", "compression-brotli", "compression-deflate", "compression-zstd", "math-middleware"],
    "fastify": ["compression-zstd"],
    "hono": ["compression-brotli", "compression-zstd"],
    "elysia": ["compression-gzip", "compression-brotli", "compression-deflate", "compression-zstd"],
};

// Runtime-specific exclusions - scenarios that don't work on specific runtimes
const RUNTIME_EXCLUSIONS: Record<string, Record<string, string[]>> = {
    "node": {
        // Shokupan on Node.js has issues with POST requests due to undici Request duplex requirement
        "shokupan": ["large-payload-request", "fully-loaded", "compression-zstd"]
    }
};

const spinner = ora({ spinner: "dots" });


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
        body: "x".repeat(10 * 1024 * 1024), // 10MB plain text
        headers: { "Content-Type": "text/plain" }
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
    const scenarioConfig = SCENARIOS[scenario as keyof typeof SCENARIOS];

    // Check if this framework/scenario combination is excluded
    const frameworkExclusions = FRAMEWORK_EXCLUSIONS[framework] || [];
    const runtimeExclusions = RUNTIME_EXCLUSIONS[runtime]?.[framework] || [];
    const allExclusions = [...frameworkExclusions, ...runtimeExclusions];

    if (allExclusions.includes(scenario)) {
        const reason = frameworkExclusions.includes(scenario)
            ? `${framework} doesn't support ${scenarioConfig.name}`
            : `${framework} on ${runtime} doesn't support ${scenarioConfig.name}`;
        return {
            error: `Skipped - ${reason}`
        } as any;
    }

    const port = await getPort();

    console.log(`Benchmark starting: \x1b[36m${scenarioConfig.name}\x1b[0m (port \x1b[36m${port}\x1b[0m)`);

    let cmd: string[];
    let caseFile: string;
    let env = {
        ...process.env,
        PORT: String(port),
        SCENARIO: scenario,
        BUN_QUIET: "1" // Suppress Bun diagnostic output
    };

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

    // pipeStream(proc.stdout, process.stdout);
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
                spinner.text = `Server is ready on port ${port}`;
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
            spinner.text = `Testing ${endpoint}...`;
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
    clack.intro("🚀 Advanced Benchmark Suite for Web Frameworks");

    // Check for CLI arguments first (backwards compatibility)
    const args = process.argv.slice(2);
    const filterIndex = args.indexOf("--filter");
    const hasFilterArg = filterIndex !== -1;
    const scenarioIndex = args.indexOf("--scenario");
    const hasScenarioArg = scenarioIndex !== -1;
    const hasAllFlag = args.includes("--all");

    let targetFrameworks: string[];
    let targetScenarios: string[];

    if (hasAllFlag) {
        // Run all frameworks and scenarios non-interactively (for CI/CD)
        targetFrameworks = FRAMEWORKS;
        targetScenarios = Object.keys(SCENARIOS);
        console.log("Running full advanced benchmark suite for all frameworks and scenarios...");
    } else if (hasFilterArg || hasScenarioArg) {
        // Legacy CLI mode
        targetFrameworks = FRAMEWORKS;
        targetScenarios = Object.keys(SCENARIOS);

        if (hasFilterArg) {
            const filter = args[filterIndex + 1];
            if (FRAMEWORKS.includes(filter)) {
                targetFrameworks = [filter];
                console.log(`Filtering frameworks: ${filter}`);
            } else {
                console.error(`Unknown framework: ${filter}. Available: ${FRAMEWORKS.join(", ")}`);
                process.exit(1);
            }
        }

        if (hasScenarioArg) {
            const scenarioFilter = args[scenarioIndex + 1];
            if (SCENARIOS[scenarioFilter as keyof typeof SCENARIOS]) {
                targetScenarios = [scenarioFilter];
                console.log(`Filtering scenarios: ${scenarioFilter}`);
            } else {
                console.error(`Unknown scenario: ${scenarioFilter}. Available: ${Object.keys(SCENARIOS).join(", ")}`);
                process.exit(1);
            }
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

        const scenarioSelection = await clack.multiselect({
            message: "Select scenarios to run:",
            options: Object.entries(SCENARIOS).map(([key, config]) => ({
                value: key,
                label: config.name,
                hint: `${config.connections} conns, ${config.duration}s`
            })),
            initialValues: Object.keys(SCENARIOS).slice(0, 3),
            required: true
        });

        if (clack.isCancel(scenarioSelection)) {
            clack.cancel("Benchmark cancelled.");
            process.exit(0);
        }

        targetScenarios = scenarioSelection as string[];
    }

    // Calculate time estimate
    const totalTests = targetFrameworks.length * RUNTIMES.length * targetScenarios.length;

    // Estimate based on actual configuration:
    // - ~2-5s for server startup per test
    // - Duration from scenario config
    // - ~1s for teardown
    // - Full advanced suite (8 frameworks × 2 runtimes × 11 scenarios) ≈ 55 minutes
    // That's 176 total tests, so roughly 18-19 seconds per test
    const avgTimePerTest = 55 * 60 / (8 * 2 * 11); // ~18.75 seconds
    const estimatedSeconds = Math.ceil(totalTests * avgTimePerTest);
    const estimatedMinutes = Math.floor(estimatedSeconds / 60);
    const remainingSeconds = estimatedSeconds % 60;

    const timeEstimate = estimatedMinutes > 0
        ? `${estimatedMinutes} minute${estimatedMinutes !== 1 ? 's' : ''}${remainingSeconds > 0 ? ` ${remainingSeconds}s` : ''}`
        : `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;

    if (hasAllFlag) {
        // Non-interactive mode for CI/CD
        console.log(`\nFrameworks: ${targetFrameworks.join(", ")}`);
        console.log(`Scenarios: ${targetScenarios.map(s => SCENARIOS[s].name).join(", ")}`);
        console.log(`Total tests: ${totalTests} (${targetFrameworks.length} frameworks × ${RUNTIMES.length} runtimes × ${targetScenarios.length} scenarios)`);
        console.log(`Estimated duration: ${timeEstimate}\n`);
    } else {
        // Interactive mode with confirmation
        clack.note(
            `Frameworks: ${targetFrameworks.join(", ")}\n` +
            `Scenarios: ${targetScenarios.map(s => SCENARIOS[s].name).join(", ")}\n` +
            `Total tests: ${totalTests} (${targetFrameworks.length} frameworks × ${RUNTIMES.length} runtimes × ${targetScenarios.length} scenarios)\n` +
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

    spinner.start("Starting benchmarks...");

    await compileForNode(targetFrameworks);
    spinner.text = "Compilation complete";

    const fullResults: AllResults = {};

    for (const framework of targetFrameworks) {
        fullResults[framework] = {};

        for (const runtime of RUNTIMES) {
            fullResults[framework][runtime] = {};

            // Skip Bun-only frameworks on Node.js
            if (runtime === "node" && BUN_ONLY_FRAMEWORKS.includes(framework)) {
                console.log(`\nSkipping ${framework} on ${runtime} for all scenarios (Bun-only framework)`);
                for (const scenario of targetScenarios) {
                    fullResults[framework][runtime][scenario] = {
                        error: "Skipped - Bun-only framework"
                    } as any;
                }
                continue;
            }

            for (const scenario of targetScenarios) {
                try {
                    spinner.text = `${framework} on ${runtime} - ${SCENARIOS[scenario].name}`;

                    console.log(`\n\x1b[30m${"=".repeat(60)}\x1b[0m`);
                    console.log(`\x1b[0mFramework: \x1b[36m${framework}\x1b[0m | \x1b[0mRuntime: \x1b[36m${runtime === "bun" ? "\x1b[33mbun\x1b[0m" : "\x1b[32mnode\x1b[0m"}\x1b[0m | \x1b[0mScenario: \x1b[36m${scenario}\x1b[0m`);
                    console.log(`\x1b[30m${"=".repeat(60)}\x1b[0m`);

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

    spinner.succeed("Benchmarks complete!");

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

    clack.log.success(`Results saved to ${HISTORY_PATH}`);

    spinner.start("Generating HTML report...");
    generateReport(history, hasAllFlag);
    spinner.succeed(`Report generated: ${REPORT_PATH}`);

    clack.outro("✨ All done!");

    // Only auto-open in interactive mode (not in CI/CD)
    if (!hasAllFlag) {
        const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
        spawn([openCmd, REPORT_PATH]);
    }
}

function generateReport(history: HistoryEntry[], skipAutoOpen = false) {
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
            max-width: 1800px;
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

        .chart-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
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
            overflow-x: auto;
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
            cursor: pointer;
            user-select: none;
            position: relative;
        }

        th:hover {
            background: #353940;
        }

        th .sort-icon {
            float: right;
            opacity: 0.3;
            font-size: 0.8rem;
            margin-left: 8px;
        }

        th.sorted-asc .sort-icon::after {
            content: '▲';
            opacity: 1;
        }

        th.sorted-desc .sort-icon::after {
            content: '▼';
            opacity: 1;
        }

        th:not(.sorted-asc):not(.sorted-desc) .sort-icon::after {
            content: '▼';
        }

        .filter-row th {
            padding: 8px 16px;
            cursor: default;
            background: #1f2023;
        }

        .filter-row th:hover {
            background: #1f2023;
        }

        .filter-input {
            width: 100%;
            padding: 6px 10px;
            background: var(--bg-color);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            color: var(--text-color);
            font-size: 0.85rem;
        }

        .filter-input:focus {
            outline: none;
            border-color: var(--primary-color);
        }

        tr:last-child td { border-bottom: none; }
        tr:hover td { background: rgba(255,255,255,0.03); }

        .error {
            color: #fa5252;
            font-style: italic;
        }

        .skipped {
            color: #ffa94d;
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
            const frameworks = Object.keys(latest);
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
            
            // Populate each scenario's charts and table
            actualScenarios.forEach((scenario, scenarioIndex) => {
                const container = document.getElementById(\`scenario-\${scenario}\`);
                let html = \`<h2>\${scenarioNames[scenario] || scenario}</h2>\`;
                
                // Add charts
                html += '<div class="chart-grid">';
                html += \`<div class="chart-container"><canvas id="chart-reqs-\${scenarioIndex}"></canvas></div>\`;
                html += \`<div class="chart-container"><canvas id="chart-latency-\${scenarioIndex}"></canvas></div>\`;
                html += '</div>';
                
                // Build table data
                const tableData = [];
                Object.entries(latest).forEach(([framework, runtimes]) => {
                    Object.entries(runtimes).forEach(([runtime, scenarios]) => {
                        const scenarioData = scenarios[scenario];
                        
                        if (scenarioData && scenarioData.error) {
                            tableData.push({
                                framework,
                                runtime,
                                endpoint: '-',
                                requests: 0,
                                latency: 0,
                                throughput: 0,
                                p95: 0,
                                p99: 0,
                                status: scenarioData.error.startsWith('Skipped') ? 'SKIPPED' : 'FAILED',
                                error: scenarioData.error,
                                statusClass: scenarioData.error.startsWith('Skipped') ? 'skipped' : 'error'
                            });
                        } else if (scenarioData) {
                            Object.entries(scenarioData).forEach(([endpoint, result]) => {
                                if (result.error) {
                                    tableData.push({
                                        framework,
                                        runtime,
                                        endpoint,
                                        requests: 0,
                                        latency: 0,
                                        throughput: 0,
                                        p95: 0,
                                        p99: 0,
                                        status: result.error.startsWith('Skipped') ? 'SKIPPED' : 'FAILED',
                                        error: result.error,
                                        statusClass: result.error.startsWith('Skipped') ? 'skipped' : 'error'
                                    });
                                } else {
                                    tableData.push({
                                        framework,
                                        runtime,
                                        endpoint,
                                        requests: result.requests || 0,
                                        latency: result.latency ||  0,
                                        throughput: result.throughput || 0,
                                        p95: result.percentiles?.p95 || 0,
                                        p99: result.percentiles?.p99 || 0,
                                        status: 'OK',
                                        statusClass: 'success'
                                    });
                                }
                            });
                        }
                    });
                });
                
                // Create sortable/filterable table
                html += '<div class="table-container"><table id="table-' + scenarioIndex + '"><thead><tr>';
                const columns = [
                    {key: 'framework', label: 'Framework'},
                    {key: 'runtime', label: 'Runtime'},
                    {key: 'endpoint', label: 'Endpoint'},
                    {key: 'requests', label: 'Req/s'},
                    {key: 'latency', label: 'Latency (ms)'},
                    {key: 'throughput', label: 'Throughput (B/s)'},
                    {key: 'p95', label: 'P95 (ms)'},
                    {key: 'p99', label: 'P99 (ms)'},
                    {key: 'status', label: 'Status'}
                ];
                
                columns.forEach(col => {
                    html += \`<th data-column="\${col.key}"><span class="sort-icon"></span>\${col.label}</th>\`;
                });
                html += '</tr><tr class="filter-row">';
                columns.forEach(col => {
                    html += \`<th><input type="text" class="filter-input" data-column="\${col.key}" placeholder="Filter..."></th>\`;
                });
                html += '</tr></thead><tbody id="tbody-' + scenarioIndex + '"></tbody></table></div>';
                
                container.innerHTML = html;
                
                // Initialize table
                const table = document.getElementById('table-' + scenarioIndex);
                const tbody = document.getElementById('tbody-' + scenarioIndex);
                let currentSort = {column: 'requests', direction: 'desc'};
                let filters = {};
                
               function renderTable() {
                    let filteredData = [...tableData];
                    
                    // Apply filters
                    Object.entries(filters).forEach(([column, value]) => {
                        if (value) {
                            filteredData = filteredData.filter(row => {
                                const cellValue = String(row[column]).toLowerCase();
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
                            return \`<tr>
                                <td>\${row.framework}</td>
                                <td>\${row.runtime}</td>
                                <td colspan="6"><span class="\${row.statusClass}">\${row.error}</span></td>
                                <td class="\${row.statusClass}">\${row.status}</td>
                            </tr>\`;
                        } else {
                            return \`<tr>
                                <td>\${row.framework}</td>
                                <td>\${row.runtime}</td>
                                <td>\${row.endpoint}</td>
                                <td><span class="metric">\${row.requests.toFixed(0)}</span></td>
                                <td><span class="metric">\${row.latency.toFixed(2)}</span></td>
                                <td><span class="metric">\${(row.throughput / 1024 / 1024).toFixed(2)}</span></td>
                                <td><span class="metric">\${row.p95.toFixed(2)}</span></td>
                                <td><span class="metric">\${row.p99.toFixed(2)}</span></td>
                                <td class="\${row.statusClass}">✓ \${row.status}</td>
                            </tr>\`;
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
                        
                        // Update sort icons
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
                
                // Initial render with default sort
                table.querySelector(\`th[data-column="\${currentSort.column}"]\`).classList.add('sorted-desc');
                renderTable();
                
                // Create charts
                setTimeout(() => {
                    const validData = tableData.filter(d => !d.error && d.requests > 0);
                    const groupedData = {};
                    
                    validData.forEach(row => {
                        const key = \`\${row.framework} (\${row.runtime})\`;
                        if (!groupedData[key]) {
                            groupedData[key] = {requests: [], latency: []};
                        }
                        groupedData[key].requests.push(row.requests);
                        groupedData[key].latency.push(row.latency);
                    });
                    
                    const labels = Object.keys(groupedData);
                    const avgRequests = labels.map(k => groupedData[k].requests.reduce((a,b) => a+b, 0) / groupedData[k].requests.length);
                    const avgLatency = labels.map(k => groupedData[k].latency.reduce((a,b) => a+b, 0) / groupedData[k].latency.length);
                    
                    // Requests chart
                    new Chart(document.getElementById(\`chart-reqs-\${scenarioIndex}\`), {
                        type: 'bar',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'Requests/sec',
                                data: avgRequests,
                                backgroundColor: labels.map(l => colors[l.split(' ')[0]] || '#909296')
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                title: {display: true, text: 'Average Requests per Second', color: '#e4e5e7'},
                                legend: {display: false}
                            },
                            scales: {
                                y: {beginAtZero: true, ticks: {color: '#909296'}, grid: {color: '#373a40'}},
                                x: {ticks: {color: '#909296'}, grid: {color: '#373a40'}}
                            }
                        }
                    });
                    
                    // Latency chart
                    new Chart(document.getElementById(\`chart-latency-\${scenarioIndex}\`), {
                        type: 'bar',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: 'Latency (ms)',
                                data: avgLatency,
                                backgroundColor: labels.map(l => colors[l.split(' ')[0]] || '#909296')
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                title: {display: true, text: 'Average Latency (lower is better)', color: '#e4e5e7'},
                                legend: {display: false}
                            },
                            scales: {
                                y: {beginAtZero: true, ticks: {color: '#909296'}, grid: {color: '#373a40'}},
                                x: {ticks: {color: '#909296'}, grid: {color: '#373a40'}}
                            }
                        }
                    });
                }, 100);
            });
        }
    </script>
</body>
</html>
`;
    fs.writeFileSync(REPORT_PATH, html);
}

main().catch(console.error);
