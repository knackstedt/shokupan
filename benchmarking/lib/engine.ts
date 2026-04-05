
import autocannon from "autocannon";
import { spawn } from "bun";
import fs from "fs";
import getPort, { portNumbers } from "get-port";
import ora from "ora";
import path from "path";
import {
    BUN_ONLY_FRAMEWORKS,
    BUN_REUSE_PORT_FRAMEWORKS,
    FRAMEWORK_EXCLUSIONS,
    MemorySample,
    RUNTIME_EXCLUSIONS,
    SCENARIOS,
    ScenarioConfig,
    ScenarioResults
} from "../config";

const CASES_DIR = path.join(import.meta.dir, "../advanced-cases");
const DIST_DIR = path.join(import.meta.dir, "../dist");
const WORKER_TS = path.join(import.meta.dir, "../advanced-worker.ts");
const WORKER_JS = path.join(DIST_DIR, "advanced-worker.cjs");

const spinner = ora({ spinner: "dots" });

export async function compileForNode(targetFrameworks: string[]) {
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

    const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dir, "../package.json"), "utf8"));
    const externals = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
    const externalFlags = externals.flatMap(e => ["--external", e]);

    // Filter out Bun-only frameworks from Node.js compilation
    const nodeFrameworks = targetFrameworks.filter(f => !BUN_ONLY_FRAMEWORKS.includes(f));
    if (nodeFrameworks.length === 0) {
        console.log("No frameworks to compile for Node.js (all are Bun-only)");
        return;
    }

    // Compile each case individually to ensure proper output
    for (const framework of nodeFrameworks) {
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
            if (err) {
                console.error("Autocannon error:", err);
                return reject(err);
            }
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

export async function runBenchmark(framework: string, runtime: string, scenario: string) {
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

    // If this scenario has processCounts array, run benchmarks for each process count
    // and return combined results with process count as part of endpoint key
    if (scenarioConfig.processCounts && scenarioConfig.processCounts.length > 0) {
        const allResults: ScenarioResults = {};
        let totalDuration = 0;

        for (const processCount of scenarioConfig.processCounts) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`Testing with ${processCount} worker${processCount > 1 ? 's' : ''}`);
            console.log('='.repeat(60));

            // Run benchmark with this specific process count
            const result = await runBenchmarkWithProcessCount(
                framework,
                runtime,
                scenario,
                scenarioConfig,
                processCount,
                startTime
            );

            // Add process count to endpoint keys for comparison
            for (const [endpoint, data] of Object.entries(result)) {
                if (endpoint !== 'duration') {
                    allResults[`${endpoint} [${processCount}w]`] = data;
                }
            }

            totalDuration += (result as any).duration || 0;
        }

        return {
            ...allResults,
            duration: totalDuration
        };
    }

    // Single process count scenario
    const processCount = scenarioConfig.processCount || 1;
    return await runBenchmarkWithProcessCount(
        framework,
        runtime,
        scenario,
        scenarioConfig,
        processCount,
        startTime
    );
}

async function runBenchmarkWithProcessCount(
    framework: string,
    runtime: string,
    scenario: string,
    scenarioConfig: ScenarioConfig,
    processCount: number,
    benchmarkStartTime: number
) {
    const startTime = Date.now();
    const isMultiProcess = processCount > 1;

    // Allocate single port for the benchmark
    const port = await getPort({ port: portNumbers(30000, 60000) });
    const ports = [port]; // Keep array for log compatibility if needed, but we only use one

    if (isMultiProcess) {
        if (runtime === "bun") {
            const workers = processCount;
            console.log(`Benchmark starting: \x1b[36m${scenarioConfig.name}\x1b[0m (${workers} workers sharing port \x1b[36m${port}\x1b[0m)`);
        } else {
            // Node cluster mode
            console.log(`Benchmark starting: \x1b[36m${scenarioConfig.name}\x1b[0m (Cluster Primary + ${processCount} workers on port \x1b[36m${port}\x1b[0m)`);
        }
    } else {
        console.log(`Benchmark starting: \x1b[36m${scenarioConfig.name}\x1b[0m (port \x1b[36m${port}\x1b[0m)`);
    }

    // Spawn worker processes
    const procs: any[] = [];
    const allOutputLines: string[][] = [];

    // For Bun with supported frameworks, we spawn N processes (OS load balancing via reusePort)
    // For Node (and incompatible Bun frameworks), we spawn 1 Primary process which forks N workers (Cluster module)
    /* 
     * Frameworks using node:http (Express, Fastify, etc.) don't support reusePort in Bun easily.
     * So for them, we use Cluster mode even in Bun.
     */
    const canUseReusePort = runtime === "bun" && BUN_REUSE_PORT_FRAMEWORKS.includes(framework);
    const procCountToSpawn = (canUseReusePort) ? processCount : 1;

    // For Node, we only have one direct child PID (the primary). We need to track it to find its children.
    let nodePrimaryPid: number | undefined;

    for (let i = 0; i < procCountToSpawn; i++) {
        let cmd: string[];
        let caseFile: string;
        let env: any = {
            ...process.env,
            PORT: String(port),
            SCENARIO: scenario,
            BUN_QUIET: "1",
            REUSE_PORT: (canUseReusePort && isMultiProcess) ? "1" : undefined,
            CLUSTER_WORKERS: (!canUseReusePort && isMultiProcess) ? String(processCount) : undefined
        };

        if (runtime === "bun") {
            cmd = ["bun", "run", WORKER_TS];
            caseFile = path.join(CASES_DIR, `${framework}.ts`);
        } else {
            // Increase memory limit for Node.js workers to 8GB to handle large payloads/high concurrency
            cmd = ["node", "--max-old-space-size=8192", WORKER_JS];
            caseFile = path.join(DIST_DIR, `${framework}.cjs`);
        }
        env['CASE_FILE'] = caseFile;

        const proc = spawn(cmd, {
            env,
            stdout: runtime === "bun" ? "inherit" : "pipe",
            stderr: runtime === "bun" ? "inherit" : "pipe",
            onExit(proc, exitCode, signalCode, error) {
                const isExpectedSignal = signalCode === 15 || signalCode === 2;
                if (exitCode !== 0 && !isExpectedSignal) {
                    console.error(`Worker process ${i + 1} exited unexpectedly with code ${exitCode}, signal ${signalCode}`);
                }
            },
        });

        if (runtime === "node" || !canUseReusePort) {
            nodePrimaryPid = proc.pid;
        }

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

        // Only pipe stderr for non-Bun runtimes since Bun uses inherit
        if (runtime !== "bun") {
            pipeStream(proc.stderr, process.stderr);
        }
        procs.push(proc);
        allOutputLines.push(outputLines);
    }

    // Wait for startup
    await new Promise(r => setTimeout(r, 2000));

    // Memory sampling logic
    const allMemorySamples: MemorySample[] = [];

    // Start interval sampling
    const samplingInterval = setInterval(async () => {
        try {
            let totalRss = 0;

            if (canUseReusePort) {
                // Sum all spawned processes (Bun reusePort mode)
                for (const proc of procs) {
                    if (proc.pid) {
                        const result = await Bun.$`ps -o rss= -p ${proc.pid}`.quiet();
                        const rss = parseInt(result.stdout.toString().trim());
                        if (!isNaN(rss)) totalRss += rss;
                    }
                }
            } else {
                // Cluster mode (Node or Bun): Find all processes (Primary + Children)
                if (nodePrimaryPid) {
                    // Get primary RSS
                    const primaryRes = await Bun.$`ps -o rss= -p ${nodePrimaryPid}`.quiet();
                    const pRss = parseInt(primaryRes.stdout.toString().trim());
                    if (!isNaN(pRss)) totalRss += pRss;

                    // Get children RSS (pgrep -P parent_pid to get child pids, then ps)
                    // Or just use pgrep to sum? pgrep doesn't output rss directly usually.
                    // Use ps --ppid
                    try {
                        const childrenRes = await Bun.$`ps -o rss= --ppid ${nodePrimaryPid}`.quiet();
                        const lines = childrenRes.stdout.toString().trim().split('\n');
                        for (const line of lines) {
                            const val = parseInt(line.trim());
                            if (!isNaN(val)) totalRss += val;
                        }
                    } catch (e) {
                        // No children or error
                    }
                }
            }

            if (totalRss > 0) {
                allMemorySamples.push({
                    timestamp: Date.now() - benchmarkStartTime,
                    rss: Math.round(totalRss / 1024)
                });
            }

        } catch (e) { }
    }, 250);


    // Check if any process died immediately
    for (let i = 0; i < procs.length; i++) {
        const proc = procs[i];
        if (proc.killed || proc.exitCode !== null) {
            clearInterval(samplingInterval);
            for (const p of procs) p.kill();
            return { error: `Process ${i + 1} died immediately`, output: allOutputLines[i].join("") };
        }
    }

    // Health check (only check the single port)
    let serverReady = false;
    let lastError: any = null;

    for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise(r => setTimeout(r, 500));

        if (procs[0].killed || procs[0].exitCode !== null) {
            clearInterval(samplingInterval);
            for (const p of procs) p.kill();
            return { error: `Process died during startup`, output: allOutputLines[0].join("") };
        }

        try {
            const testEndpoint = scenarioConfig.endpoints[0];
            const healthCheck = await fetch(`http://localhost:${port}${testEndpoint}`, {
                signal: AbortSignal.timeout(1000),
                method: (scenarioConfig.method as any) || "GET"
            });
            if (healthCheck.ok || healthCheck.status < 500) {
                serverReady = true;
                break;
            }
            lastError = `HTTP ${healthCheck.status}`;
        } catch (e: any) {
            lastError = e.message || String(e);
        }
    }

    if (!serverReady) {
        clearInterval(samplingInterval);
        for (const p of procs) p.kill();
        await new Promise(r => setTimeout(r, 1000));
        return { error: `Server failed to start on port ${port}: ${lastError}`, output: allOutputLines[0].join("") };
    }

    spinner.text = `Server ready on port ${port}`;

    const results: ScenarioResults = {};

    try {
        for (const endpoint of scenarioConfig.endpoints) {
            spinner.text = `Testing ${endpoint}${isMultiProcess ? ` (multi-process)` : ''}...`;

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
                    memory: allMemorySamples.length > 0 ? allMemorySamples : undefined
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
        clearInterval(samplingInterval);
        for (const proc of procs) {
            proc.kill();
        }
        await new Promise(r => setTimeout(r, 500));
    }

    return {
        ...results,
        duration: Date.now() - startTime
    };
}
