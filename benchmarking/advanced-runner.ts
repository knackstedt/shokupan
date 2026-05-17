
import * as clack from "@clack/prompts";
import { spawn } from "bun";
import fs from "fs";
import ora from "ora";
import os from "os";
import path from "path";
import {
    AllResults,
    BUN_ONLY_FRAMEWORKS,
    FRAMEWORKS,
    HistoryEntry,
    RUNTIMES,
    SCENARIOS,
    SystemInfo
} from "./config";
import { compileForNode, runBenchmark } from "./lib/engine";
import { generateReport } from "./lib/report";

const HISTORY_PATH = path.join(import.meta.dir, "advanced-results.json");
const spinner = ora({ spinner: "dots" });

async function main() {
    clack.intro("🚀 Advanced Benchmark Suite for Web Frameworks");

    // Check for CLI arguments first (backwards compatibility)
    const args = process.argv.slice(2);
    const filterIndex = args.indexOf("--filter");
    const hasFilterArg = filterIndex !== -1;
    const scenarioIndex = args.indexOf("--scenario");
    const hasScenarioArg = scenarioIndex !== -1;
    const hasAllFlag = args.includes("--all");
    const isReportOnly = args.includes("--report-only");
    const noWarmup = args.includes("--no-warmup");
    const shuffleRuns = args.includes("--shuffle-runs") ? 3 : 1;

    if (isReportOnly) {
        console.log("Generating report from existing history...");
        let history: HistoryEntry[] = [];
        if (fs.existsSync(HISTORY_PATH)) {
            try {
                history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
            } catch (e) {
                console.error("Failed to parse history.");
            }
        }
        const reportPath = generateReport(history);
        console.log(`Report generated: ${reportPath}`);

        const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
        spawn([openCmd, reportPath]);
        return;
    }

    // Parse shuffle runs argument
    const shuffleRunsIndex = args.indexOf("--shuffle-runs");
    const numShuffleRuns = shuffleRunsIndex !== -1 
        ? parseInt(args[shuffleRunsIndex + 1]) || 3 
        : 1;

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
                hint: `${config.connections} conns, ${config.durationEstimate! * targetFrameworks.length * 2}s`
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
        return SCENARIOS[s].durationEstimate || 10;
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

    // Build test matrix
    const testMatrix: Array<{ framework: string; runtime: string; scenario: string }> = [];
    for (const framework of targetFrameworks) {
        for (const runtime of RUNTIMES) {
            // Skip Bun-only frameworks on Node.js
            if (runtime === "node" && BUN_ONLY_FRAMEWORKS.includes(framework)) {
                continue;
            }
            for (const scenario of targetScenarios) {
                testMatrix.push({ framework, runtime, scenario });
            }
        }
    }

    // System warmup phase: Run a throwaway benchmark to warm up the system
    if (!noWarmup && testMatrix.length > 0) {
        spinner.text = "System warmup phase...";
        const warmupTest = testMatrix[0];
        try {
            // Run a short warmup test (not recorded)
            await runBenchmark(warmupTest.framework, warmupTest.runtime, warmupTest.scenario);
        } catch (e) {
            // Ignore warmup errors
        }
        // Allow system to settle after warmup
        await new Promise(r => setTimeout(r, 2000));
    }

    const fullResults: AllResults = {};
    const allRunResults: Array<{ shuffleIndex: number; results: AllResults }> = [];
    const benchStartTime = Date.now();

    for (let runIndex = 0; runIndex < numShuffleRuns; runIndex++) {
        // Shuffle the test matrix using Fisher-Yates algorithm for fair distribution
        const shuffledMatrix = [...testMatrix];
        for (let i = shuffledMatrix.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledMatrix[i], shuffledMatrix[j]] = [shuffledMatrix[j], shuffledMatrix[i]];
        }

        if (numShuffleRuns > 1) {
            console.log(`\n\x1b[33m🎲 Shuffle Run ${runIndex + 1}/${numShuffleRuns}\x1b[0m`);
        }

        const runResults: AllResults = {};

        for (const test of shuffledMatrix) {
            const { framework, runtime, scenario } = test;

            // Initialize result structures if needed
            if (!runResults[framework]) runResults[framework] = {};
            if (!runResults[framework][runtime]) runResults[framework][runtime] = {};

            try {
                spinner.text = `${framework} on ${runtime} - ${SCENARIOS[scenario].name}`;

                console.log(`\n\x1b[30m${"=".repeat(60)}\x1b[0m`);
                console.log(`\x1b[0mFramework: \x1b[36m${framework}\x1b[0m | \x1b[0mRuntime: \x1b[36m${runtime === "bun" ? "\x1b[33mbun\x1b[0m" : "\x1b[32mnode\x1b[0m"}\x1b[0m | \x1b[0mScenario: \x1b[36m${scenario}\x1b[0m`);
                console.log(`\x1b[30m${"=".repeat(60)}\x1b[0m`);

                const testStartTime = Date.now();
                const res = await runBenchmark(framework, runtime, scenario);
                const testDuration = (Date.now() - testStartTime) / 1000;

                runResults[framework][runtime][scenario] = res as any;

                // Log test completion time
                if (res && res.error) {
                    console.log(`\x1b[90m  ${res.error.startsWith('Skipped') ? 'Skipped' : 'Failed'} (${testDuration.toFixed(2)}s)\x1b[0m`);
                } else {
                    console.log(`\x1b[32m  ✓ Completed in ${testDuration.toFixed(2)}s\x1b[0m`);
                }
            } catch (e: any) {
                console.error(`Failed ${framework}/${runtime}/${scenario}:`, e.message);
                runResults[framework][runtime][scenario] = {
                    error: e.message || "Failed to run"
                } as any;
            }
        }

        allRunResults.push({ shuffleIndex: runIndex, results: runResults });
    }

    // Aggregate results across all shuffle runs
    // For each framework/runtime/scenario, average the results
    for (const framework of targetFrameworks) {
        fullResults[framework] = {};
        for (const runtime of RUNTIMES) {
            fullResults[framework][runtime] = {};
            for (const scenario of targetScenarios) {
                const allScenarioResults = allRunResults
                    .map(r => r.results[framework]?.[runtime]?.[scenario])
                    .filter(r => r && !r.error);

                if (allScenarioResults.length === 0) {
                    // Check if it's a Bun-only skip
                    if (runtime === "node" && BUN_ONLY_FRAMEWORKS.includes(framework)) {
                        fullResults[framework][runtime][scenario] = {
                            error: "Skipped - Bun-only framework"
                        } as any;
                    } else {
                        fullResults[framework][runtime][scenario] = {
                            error: "Failed to run"
                        } as any;
                    }
                } else if (allScenarioResults.length === 1) {
                    fullResults[framework][runtime][scenario] = allScenarioResults[0];
                } else {
                    // Average numeric metrics across runs
                    const aggregated: any = {};
                    const endpoints = Object.keys(allScenarioResults[0]).filter(k => k !== 'duration' && k !== 'error');
                    
                    for (const endpoint of endpoints) {
                        const endpointResults = allScenarioResults.map(r => r[endpoint]).filter(Boolean);
                        if (endpointResults.length === 0) continue;

                        aggregated[endpoint] = {
                            requests: endpointResults.reduce((sum, r) => sum + (r.requests || 0), 0) / endpointResults.length,
                            latency: endpointResults.reduce((sum, r) => sum + (r.latency || 0), 0) / endpointResults.length,
                            throughput: endpointResults.reduce((sum, r) => sum + (r.throughput || 0), 0) / endpointResults.length,
                        };

                        // Average percentiles if present
                        if (endpointResults[0].percentiles) {
                            const percentileKeys = Object.keys(endpointResults[0].percentiles);
                            aggregated[endpoint].percentiles = {};
                            for (const p of percentileKeys) {
                                aggregated[endpoint].percentiles[p] = endpointResults.reduce((sum, r) => sum + (r.percentiles?.[p] || 0), 0) / endpointResults.length;
                            }
                        }
                    }
                    
                    aggregated.duration = allScenarioResults.reduce((sum, r) => sum + ((r as any).duration || 0), 0) / allScenarioResults.length;
                    aggregated.aggregatedRuns = allScenarioResults.length;
                    
                    fullResults[framework][runtime][scenario] = aggregated;
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

    const systemInfo: SystemInfo = {
        os: `${os.type()} ${os.release()}`,
        kernel: os.version(),
        node: process.version,
        bun: Bun.version,
        cpu: {
            model: os.cpus()[0].model,
            speed: os.cpus()[0].speed,
            cores: os.cpus().length
        },
        memory: {
            total: os.totalmem()
        }
    };

    const newEntry: HistoryEntry = {
        timestamp: Date.now(),
        system: systemInfo,
        results: fullResults
    };

    history.push(newEntry);
    if (history.length > 10) {
        history = history.slice(history.length - 10);
    }

    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

    spinner.start("Generating HTML report...");
    const reportPath = generateReport(history);
    spinner.succeed(` Report generated: ${reportPath}`);

    clack.outro("✨ All done!");

    // Only auto-open in interactive mode (not in CI/CD)
    if (!hasAllFlag) {
        const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
        spawn([openCmd, reportPath]);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
