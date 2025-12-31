import autocannon from "autocannon";
import { spawn } from "bun";
import fs from "fs";
import path from "path";
// We will use a system command to open the browser.

const FRAMEWORKS = ["shokupan", "fastify", "express", "koa", "hapi", "nest", "hono", "elysia"];
const RUNTIMES = ["bun", "node"];
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
};

type RuntimeResults = Record<string, Record<string, BenchmarkResult>>; // runtime -> endpoint -> result
type FrameworkResults = Record<string, RuntimeResults>; // framework -> runtime -> endpoint -> result

type HistoryEntry = {
    timestamp: number;
    results: FrameworkResults;
};

// Helper to get arguments
const args = process.argv.slice(2);
const filterIndex = args.indexOf("--filter");
const filter = filterIndex !== -1 ? args[filterIndex + 1] : null;

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
        autocannon({
            url,
            connections: 100,
            duration: 5
        }, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
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
            const isExpectedSignal = signalCode === 15 || signalCode === "SIGTERM" || signalCode === 2 || signalCode === "SIGINT";
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
                results[endpoint] = {
                    requests: res.requests.average,
                    latency: res.latency.average,
                    throughput: res.throughput.average
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
    let targetFrameworks = FRAMEWORKS;

    if (filter) {
        if (FRAMEWORKS.includes(filter)) {
            targetFrameworks = [filter];
            console.log(`Running benchmarks only for: ${filter}`);
        } else {
            console.error(`Unknown framework: ${filter}. Available: ${FRAMEWORKS.join(", ")}`);
            process.exit(1);
        }
    }

    await compileForNode(targetFrameworks);

    const fullResults: FrameworkResults = {};

    for (const framework of targetFrameworks) {
        fullResults[framework] = {};
        for (const runtime of RUNTIMES) {
            try {
                const res = await runBenchmark(framework, runtime);
                fullResults[framework][runtime] = res as any;
            } catch (e) {
                console.error(`Total failure for ${framework} on ${runtime}:`, e);
                fullResults[framework][runtime] = { error: "Failed to run" } as any;
            }
        }
    }

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

    generateReport(history);
}

function generateReport(history: HistoryEntry[]) {
    // We reverse history so index 0 is the Latest
    const sortedHistory = [...history].reverse();

    const generateTable = (results: FrameworkResults) => {
        // Sort frameworks by "Performance Score" (Max Requests/Sec across all variants)
        const sortedFrameworks = Object.keys(results).sort((a, b) => {
            const getMaxReq = (fw: string) => {
                let max = 0;
                for (const rt of RUNTIMES) {
                    const rtRes = results[fw]?.[rt];
                    if (!rtRes || (rtRes as any).error) continue;
                    for (const ep of ENDPOINTS) {
                        const val = (rtRes as any)[ep]?.requests || 0;
                        if (val > max) max = val;
                    }
                }
                return max;
            };
            return getMaxReq(b) - getMaxReq(a);
        });

        let tableRows = "";
        for (const fw of sortedFrameworks) {
            tableRows += `<h2>${fw}</h2>
            <table>
                <thead>
                    <tr>
                        <th>Runtime</th>
                        <th>Endpoint</th>
                        <th>Req/s (Avg)</th>
                        <th>Latency (Avg ms)</th>
                        <th>Throughput (Avg bytes/s)</th>
                    </tr>
                </thead>
                <tbody>`;

            for (const rt of RUNTIMES) {
                const res = results[fw][rt];
                if (!res || (res as any).error) {
                    // Only show error if we expected results for this framework (it exists in the results object)
                    // If this is a filtered run and framework is missing, it won't be in sortedFrameworks anyway.
                    if (res) {
                        tableRows += `<tr><td>${rt}</td><td colspan="4">Error: ${(res as any)?.error || 'Unknown'}</td></tr>`;
                    } else {
                        tableRows += `<tr><td>${rt}</td><td colspan="4">No Data</td></tr>`;

                    }
                    continue;
                }

                for (const ep of ENDPOINTS) {
                    const epRes = (res as any)[ep];
                    tableRows += `
                            <tr>
                                <td>${rt}</td>
                                <td>${ep}</td>
                                <td>${epRes?.requests?.toFixed(2) || '-'}</td>
                                <td>${epRes?.latency?.toFixed(2) || '-'}</td>
                                <td>${(epRes?.throughput ? (epRes.throughput / 1024 / 1024).toFixed(2) + ' MB/s' : '-')}</td>
                            </tr>`;
                }
            }
            tableRows += `</tbody></table>`;
        }
        return tableRows;
    };

    const tabsNav = sortedHistory.map((entry, idx) => {
        const date = new Date(entry.timestamp).toLocaleString();
        const active = idx === 0 ? 'active' : '';
        return `<button class="tab-btn ${active}" onclick="openTab(event, 'run-${entry.timestamp}')">${date} ${idx === 0 ? '(Latest)' : ''}</button>`;
    }).join("");

    const tabsContent = sortedHistory.map((entry, idx) => {
        const display = idx === 0 ? 'block' : 'none';
        return `<div id="run-${entry.timestamp}" class="tab-content" style="display: ${display};">
            ${generateTable(entry.results)}
        </div>`;
    }).join("");


    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Benchmark Results</title>
    <style>
        :root {
            --bg-color: #1a1b1e;
            --text-color: #e4e5e7;
            --table-bg: #25262b;
            --table-border: #373a40;
            --primary-color: #339af0;
            --header-bg: #2c2e33;
            --tab-active-bg: #339af0;
            --tab-inactive-bg: #2c2e33;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-color);
            font-family: system-ui, -apple-system, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px 20px;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
        }

        h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            background: linear-gradient(45deg, #339af0, #51cf66);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        h2 {
            margin-top: 40px;
            border-bottom: 1px solid var(--table-border);
            padding-bottom: 10px;
            font-size: 1.5rem;
            color: #fff;
        }

        table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            background-color: var(--table-bg);
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
            margin-bottom: 2rem;
        }

        th, td {
            padding: 12px 16px;
            text-align: left;
            border-bottom: 1px solid var(--table-border);
        }

        th {
            background-color: var(--header-bg);
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.85rem;
            letter-spacing: 0.5px;
            color: var(--primary-color);
        }

        tr:last-child td {
            border-bottom: none;
        }

        tr:hover td {
            background-color: rgba(255, 255, 255, 0.03);
        }

        .meta {
            color: #909296;
            font-size: 0.9rem;
            margin-bottom: 40px;
        }

        /* Tabs */
        .tabs-nav {
            margin-bottom: 20px;
            display: flex;
            gap: 10px;
            overflow-x: auto;
            padding-bottom: 10px;
        }

        .tab-btn {
            background-color: var(--tab-inactive-bg);
            color: var(--text-color);
            border: 1px solid var(--table-border);
            padding: 8px 16px;
            cursor: pointer;
            border-radius: 4px;
            white-space: nowrap;
        }

        .tab-btn:hover {
            background-color: #3b3e45;
        }

        .tab-btn.active {
            background-color: var(--tab-active-bg);
            color: white;
            border-color: var(--tab-active-bg);
        }

        .tab-content {
            animation: fadeEffect 0.5s;
        }

        @keyframes fadeEffect {
            from {opacity: 0;}
            to {opacity: 1;}
        }

    </style>
    <script>
        function openTab(evt, tabId) {
            var i, tabcontent, tablinks;
            tabcontent = document.getElementsByClassName("tab-content");
            for (i = 0; i < tabcontent.length; i++) {
                tabcontent[i].style.display = "none";
            }
            tablinks = document.getElementsByClassName("tab-btn");
            for (i = 0; i < tablinks.length; i++) {
                tablinks[i].className = tablinks[i].className.replace(" active", "");
            }
            document.getElementById(tabId).style.display = "block";
            evt.currentTarget.className += " active";
        }
    </script>
</head>
<body>
    <div class="container">
        <h1>Benchmark Results</h1>
        <p class="meta">Viewing Report</p>
        
        <div class="tabs-nav">
            ${tabsNav}
        </div>

        ${tabsContent}
    </div>
</body>
</html>`;

    fs.writeFileSync(REPORT_PATH, html);
    console.log(`Report generated at ${REPORT_PATH}`);

    const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    spawn([openCmd, REPORT_PATH]);
}

main();

