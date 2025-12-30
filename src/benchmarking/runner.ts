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
        stdout: "inherit",
        stderr: "inherit",
        onExit(proc, exitCode, signalCode, error) {
            if (exitCode !== 0 && signalCode !== 15 && signalCode !== 2) { // 15 is SIGTERM
                console.error(`Process exited with code ${exitCode}`);
            }
        },
    });

    // Wait for server to be ready
    await new Promise(r => setTimeout(r, 2000));

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
