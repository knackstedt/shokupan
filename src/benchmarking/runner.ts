import autocannon from "autocannon";
import { spawn } from "bun";
import fs from "fs";
import path from "path";
// We will use a system command to open the browser.

const FRAMEWORKS = ["shokupan", "fastify", "express", "koa", "hapi", "nest"];
const RUNTIMES = ["bun", "node"];
const ENDPOINTS = ["static", "json", "dynamic/123"];

const CASES_DIR = path.join(import.meta.dir, "cases");
const DIST_DIR = path.join(import.meta.dir, "dist");
const WORKER_TS = path.join(import.meta.dir, "worker.ts");
const WORKER_JS = path.join(DIST_DIR, "worker.cjs");
const REPORT_PATH = path.join(import.meta.dir, "report.html");

async function compileForNode() {
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
    // We must compile each one individually to ensure we get individual entrypoints with predictable names
    // or use outdir with multiple entrypoints.
    const entrypoints = FRAMEWORKS.map(f => path.join(CASES_DIR, `${f}.ts`));
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
            // Bun might pass signalCode as string (e.g. "SIGTERM") or number depending on version/context.
            // Node compatibility usually means string.
            // We ignore SIGTERM (15) and SIGINT (2) as "unexpected" if we triggered them.
            const isExpectedSignal = signalCode === 15 || signalCode === "SIGTERM" || signalCode === 2 || signalCode === "SIGINT";
            
            if (exitCode !== 0 && !isExpectedSignal) {
                console.error(`Process exited unexpectedly with code ${exitCode}, signal ${signalCode}`);
                if (error) console.error(`Error: ${error}`);
            }
        },
    });

    // Helper to pipe stream to process.stdout/stderr and capture lines
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
                // Simple accumulation for error reporting
                // Note: this might separate lines incorrectly if chunks end mid-line, but sufficient for debug logs
                if (outputLines.length < 100) { // Limit stored log size
                    outputLines.push(text);
                }
            }
        } catch (e) {
            // Stream closed or error
        }
    };

    const outputLines: string[] = [];
    // Start piping in background without awaiting
    pipeStream(proc.stdout, process.stdout);
    pipeStream(proc.stderr, process.stderr);

    // Wait a bit for the process to start
    await new Promise(r => setTimeout(r, 1500));
    
    // Check if process is still alive
    if (proc.killed || proc.exitCode !== null) {
        console.error(`Process died immediately. Exit code: ${proc.exitCode}`);
        console.error("Last output:");
        console.error(outputLines.join(""));
        return { error: "Process died immediately" };
    }

    // Wait for server to be ready with health check
    let serverReady = false;
    let lastError: any = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 500));
        
        // Check if process died
        if (proc.killed || proc.exitCode !== null) {
            console.error(`Process died during startup. Exit code: ${proc.exitCode}`);
            console.error("Last output:");
            console.error(outputLines.join(""));
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
            // Server not ready yet, continue waiting
        }
    }

    if (!serverReady) {
        console.error(`Server failed to start on port ${port}`);
        console.error(`Last error: ${lastError}`);
        console.error(`Framework: ${framework}, Runtime: ${runtime}`);
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
        // Give it a moment to die
        await new Promise(r => setTimeout(r, 500));
    }

    return results;
}

async function main() {
    await compileForNode();

    const fullResults: Record<string, Record<string, any>> = {};

    for (const framework of FRAMEWORKS) {
        fullResults[framework] = {};
        for (const runtime of RUNTIMES) {
            // NestJS/Hapi might fail on Bun or vice versa depending on compatibility.
            // We'll try anyway.
            try {
                const res = await runBenchmark(framework, runtime);
                fullResults[framework][runtime] = res;
            } catch (e) {
                console.error(`Total failure for ${framework} on ${runtime}:`, e);
                fullResults[framework][runtime] = { error: "Failed to run" };
            }
        }
    }

    generateReport(fullResults);
}

function generateReport(data: any) {
    let tableRows = "";

    for (const fw of FRAMEWORKS) {
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
            const res = data[fw][rt];
            if (!res || res.error) {
                tableRows += `<tr><td>${rt}</td><td colspan="4">Error: ${res?.error || 'Unknown'}</td></tr>`;
                continue;
            }

            for (const ep of ENDPOINTS) {
                const epRes = res[ep];
                tableRows += `
                        <tr>
                            <td>${rt}</td>
                            <td>${ep}</td>
                            <td>${epRes?.requests?.toFixed(2) || '-'}</td>
                            <td>${epRes?.latency?.toFixed(2) || '-'}</td>
                            <td>${(epRes?.throughput / 1024 / 1024).toFixed(2)} MB/s</td>
                        </tr>`;
            }
        }
        tableRows += `</tbody></table>`;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Benchmark Results</title>
    <style>
        body { font-family: system-ui, sans-serif; padding: 20px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        h2 { margin-top: 30px; }
    </style>
</head>
<body>
    <h1>Benchmark Results</h1>
    <p>Generated on ${new Date().toLocaleString()}</p>
    ${tableRows}
</body>
</html>`;

    fs.writeFileSync(REPORT_PATH, html);
    console.log(`Report generated at ${REPORT_PATH}`);

    // Try to open
    const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    spawn([openCmd, REPORT_PATH]);
}

main();
