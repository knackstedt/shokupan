import * as clack from "@clack/prompts";
import autocannon from "autocannon";
import { spawn } from "bun";
import { Eta } from 'eta';
import fs from "fs";
import getPort, { portNumbers } from "get-port";
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
        "shokupan": ["fully-loaded", "compression-zstd"]
    },
    "bun": {
        // Express body-parser has issues with large payloads on Bun
        "express": ["large-payload-request"],
        // Koa compression middleware has stream issues on Bun
        "koa": ["compression-gzip", "compression-deflate"]
    }
};

const spinner = ora({ spinner: "dots" });


// Advanced scenarios
type ScenarioConfig = {
    name: string;
    endpoints: string[];
    connections: number;
    duration: number;
    durationEstimate?: number;
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    timeout?: number;
};

// Memory sample collected during benchmark execution
type MemorySample = {
    timestamp: number;      // Milliseconds since benchmark start
    rss: number;           // Resident Set Size (MB)
};

const SCENARIOS: Record<string, ScenarioConfig> = {
    // Compression tests - test each algorithm separately
    "compression-gzip": {
        name: "Compression (gzip)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        durationEstimate: 23,
        headers: { "Accept-Encoding": "gzip" }
    },
    "compression-brotli": {
        name: "Compression (brotli)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        durationEstimate: 23,
        headers: { "Accept-Encoding": "br" }
    },
    "compression-deflate": {
        name: "Compression (deflate)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        durationEstimate: 23,
        headers: { "Accept-Encoding": "deflate" }
    },
    "compression-zstd": {
        name: "Compression (zstd)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        durationEstimate: 23,
        headers: { "Accept-Encoding": "zstd" }
    },
    "compression-store": {
        name: "No Compression (baseline)",
        endpoints: ["/compressed", "/compressed-large"],
        connections: 100,
        duration: 10,
        durationEstimate: 23,
        headers: {}
    },

    // Large payload tests
    "large-payload-request": {
        name: "Large Request Payload (10MB POST)",
        endpoints: ["/large-request"],
        connections: 50,
        duration: 10,
        durationEstimate: 13,
        method: "POST",
        body: "x".repeat(10 * 1024 * 1024), // 10MB plain text
        headers: { "Content-Type": "text/plain" }
    },
    "large-payload-response": {
        name: "Large Response Payload (5MB JSON)",
        endpoints: ["/large-response"],
        connections: 50,
        duration: 10,
        durationEstimate: 13
    },
    "large-payload-headers": {
        name: "Large Headers (100 headers)",
        endpoints: ["/large-headers"],
        connections: 100,
        duration: 10,
        durationEstimate: 13
    },

    // Math middleware test
    "math-middleware": {
        name: "10 MD5 Middleware Chain",
        endpoints: ["/compute"],
        connections: 100,
        duration: 10,
        durationEstimate: 13
    },

    // Scaling test
    "scaling": {
        name: "1000 Route Handlers (Scaling)",
        endpoints: Array.from({ length: 10 }, (_, i) => `/route-${Math.floor(Math.random() * 1000)}`),
        connections: 100,
        duration: 10,
        durationEstimate: 110
    },

    // Fully loaded test
    "fully-loaded": {
        name: "Fully Loaded (Validators + ALS)",
        endpoints: ["/validate"],
        connections: 100,
        duration: 10,
        durationEstimate: 13,
        method: "POST",
        body: JSON.stringify({ data: "test" }),
        headers: { "Content-Type": "application/json" }
    },

    // Long pending test - tests high concurrency with small delays
    "long-pending": {
        name: "High Concurrency (10000 concurrent, 100ms delay)",
        endpoints: ["/delayed"],
        connections: 10000,
        duration: 10,
        durationEstimate: 13.5,
        timeout: 30 // Allow enough time for responses
    },

    // Property access test - simple property read performance
    "property-access": {
        name: "Property Access (path)",
        endpoints: ["/property/path"],
        connections: 100,
        duration: 10,
        durationEstimate: 13
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
    memory?: MemorySample[];  // Memory samples collected during benchmark
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
    const startTime = Date.now();
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
            error: `Skipped - ${reason}`,
            duration: Date.now() - startTime
        } as any;
    }

    // Get port with retries and wider range for high-concurrency scenarios
    let port: number | undefined;
    let portAttempts = 0;
    const maxPortAttempts = 10;

    while (!port && portAttempts < maxPortAttempts) {
        try {
            port = await getPort({ port: portNumbers(30000, 60000) });
            break;
        } catch (e) {
            portAttempts++;
            if (portAttempts >= maxPortAttempts) {
                throw new Error(`No available ports found after ${maxPortAttempts} attempts`);
            }
            // Wait a bit before retrying to let ports get released
            await new Promise(r => setTimeout(r, 100));
        }
    }

    if (!port) {
        throw new Error("No available ports found");
    }

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
    const memorySamples: MemorySample[] = [];
    let memoryInterval: Timer | null = null;
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

    //Start memory sampling interval
    const pid = proc.pid;
    if (pid) {
        // Take initial sample immediately
        try {
            const result = await Bun.$`ps -o rss= -p ${pid}`.quiet();
            const rss = parseInt(result.stdout.toString().trim());
            if (!isNaN(rss)) {
                memorySamples.push({
                    timestamp: 0, // Initial sample at t=0
                    rss: Math.round(rss / 1024) // Convert KB to MB
                });
            }
        } catch (e) {
            // Process might have ended, ignore errors
        }

        // Then start interval for ongoing sampling
        memoryInterval = setInterval(async () => {
            try {
                // Use ps command to get RSS (in KB)
                const result = await Bun.$`ps -o rss= -p ${pid}`.quiet();
                const rss = parseInt(result.stdout.toString().trim());
                if (!isNaN(rss)) {
                    memorySamples.push({
                        timestamp: Date.now() - startTime,
                        rss: Math.round(rss / 1024) // Convert KB to MB
                    });
                }
            } catch (e) {
                //Process might have ended, ignore errors
            }
        }, 250);
    }


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
                    percentiles,
                    memory: memorySamples.length > 0 ? memorySamples : undefined
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
        if (memoryInterval) {
            clearInterval(memoryInterval);
        }
        proc.kill();
        await new Promise(r => setTimeout(r, 500));
    }

    return {
        ...results,
        duration: Date.now() - startTime
    };
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
                hint: `${config.connections} conns, ${config.durationEstimate * targetFrameworks.length * 2}s`
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

    const testCount = targetFrameworks.length * RUNTIMES.length * targetScenarios.length;;
    const durationEstimate = (targetFrameworks.length * 2 - BUN_ONLY_FRAMEWORKS.length) * targetScenarios.map(s => {
        return SCENARIOS[s].durationEstimate;
    }).reduce((acc, val) => acc + val, 0);

    // Estimate based on actual configuration:
    const estimatedSeconds = Math.ceil(durationEstimate);
    const estimatedMinutes = Math.floor(estimatedSeconds / 60);
    const remainingSeconds = estimatedSeconds % 60;

    const timeEstimate = estimatedMinutes > 0
        ? `${estimatedMinutes} minute${estimatedMinutes !== 1 ? 's' : ''}${remainingSeconds > 0 ? ` ${remainingSeconds}s` : ''}`
        : `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;

    if (hasAllFlag) {
        // Non-interactive mode for CI/CD
        console.log(`\nFrameworks: ${targetFrameworks.join(", ")}`);
        console.log(`Scenarios: \n    ${targetScenarios.map(s => SCENARIOS[s].name).join("\n    ")}`);
        console.log(`Total tests: ${testCount} (${targetFrameworks.length} frameworks × ${RUNTIMES.length} runtimes × ${targetScenarios.length} scenarios)`);
        console.log(`Estimated duration: ${timeEstimate}\n`);
    } else {
        // Interactive mode with confirmation
        clack.note(
            `Frameworks: ${targetFrameworks.join(", ")}\n` +
            `Scenarios: \n    ${targetScenarios.map(s => SCENARIOS[s].name).join("\n    ")}\n` +
            `Total tests: ${testCount} (${targetFrameworks.length} frameworks × ${RUNTIMES.length} runtimes × ${targetScenarios.length} scenarios)\n` +
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
    const benchStartTime = Date.now();

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

                    const testStartTime = Date.now();
                    const res = await runBenchmark(framework, runtime, scenario);
                    const testDuration = (Date.now() - testStartTime) / 1000;

                    fullResults[framework][runtime][scenario] = res as any;

                    // Log test completion time
                    if (res.error) {
                        console.log(`\x1b[90m  ${res.error.startsWith('Skipped') ? 'Skipped' : 'Failed'} (${testDuration.toFixed(2)}s)\x1b[0m`);
                    } else {
                        console.log(`\x1b[32m  ✓ Completed in ${testDuration.toFixed(2)}s\x1b[0m`);
                    }
                } catch (e: any) {
                    console.error(`Failed ${framework}/${runtime}/${scenario}:`, e.message);
                    fullResults[framework][runtime][scenario] = {
                        error: e.message || "Failed to run"
                    } as any;
                }
            }
        }
    }

    spinner.succeed(" Benchmarks complete!");
    const benchDuration = (Date.now() - benchStartTime) / 1000;
    console.log(`\n\x1b[30m${"=".repeat(60)}\x1b[0m`);
    console.log(`\x1b[0mBenchmarks completed in ${benchDuration.toFixed(2)}s\x1b[0m`);
    console.log(`\x1b[30m${"=".repeat(60)}\x1b[0m`);

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

    spinner.start("Generating HTML report...");
    generateReport(history, hasAllFlag);
    spinner.succeed(` Report generated: ${REPORT_PATH}`);

    clack.outro("✨ All done!");

    // Only auto-open in interactive mode (not in CI/CD)
    if (!hasAllFlag) {
        const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
        spawn([openCmd, REPORT_PATH]);
    }

    process.exit(0);
}

function generateReport(history: HistoryEntry[], skipAutoOpen = false) {
    const sortedHistory = [...history].reverse();
    const latest = sortedHistory[0];

    // Extract actual scenarios that were run
    const runScenarios = new Set<string>();
    Object.values(latest.results).forEach(frameworkRes => {
        Object.values(frameworkRes).forEach(runtimeRes => {
            Object.keys(runtimeRes).forEach(scenario => {
                runScenarios.add(scenario);
            });
        });
    });
    const actualScenarios = Array.from(runScenarios);

    // Read template files
    const templatePath = path.join(__dirname, 'report', 'template.eta');
    const template = fs.readFileSync(templatePath, 'utf-8');

    // Render template with data
    const eta = new Eta({
        views: path.join(__dirname, 'report')
    });
    const html = eta.renderString(template, {
        dataJson: JSON.stringify(sortedHistory),
        scenarioNamesJson: JSON.stringify(Object.fromEntries(Object.entries(SCENARIOS).map(([k, v]) => [k, v.name]))),
        actualScenariosJson: JSON.stringify(actualScenarios)
    });

    fs.writeFileSync(REPORT_PATH, html);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
