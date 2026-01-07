import "reflect-metadata";

async function main() {
    const caseFile = process.env['CASE_FILE'];
    const port = parseInt(process.env['PORT'] || "3000", 10);
    const scenario = process.env['SCENARIO'];

    // Cluster support
    // Check if CLUSTER_WORKERS is set to determine if we should act as a cluster primary
    const workersStr = process.env['CLUSTER_WORKERS'];

    if (workersStr && parseInt(workersStr) > 0) {
        try {
            // @ts-ignore - dynamic import
            // In Bun, "cluster" is available as "node:cluster" or "cluster". In Node, "cluster".
            // We use standard import which works in both environments (Bun maps "cluster" to "node:cluster" internal)
            const cluster = await import("cluster");

            if (cluster.default.isPrimary) {
                const numWorkers = parseInt(workersStr);
                console.log(`Primary ${process.pid} is running. Forking ${numWorkers} workers...`);

                for (let i = 0; i < numWorkers; i++) {
                    cluster.default.fork();
                }

                cluster.default.on('exit', (worker, code, signal) => {
                    if (code !== 0 && !worker.exitedAfterDisconnect) {
                        console.log(`Worker ${worker.process.pid} died. Restarting...`);
                        cluster.default.fork();
                    }
                });

                // Keep primary alive
                return;
            }
        } catch (e) {
            console.error("Cluster module error:", e);
        }
    }

    if (!caseFile) {
        console.error("No CASE_FILE provided");
        process.exit(1);
    }

    if (!scenario) {
        console.error("No SCENARIO provided");
        process.exit(1);
    }

    try {
        console.log(`Advanced worker loading ${caseFile} for scenario: ${scenario}`);
        const mod = await import(caseFile);
        const startFn = mod.startAdvanced || mod.default?.startAdvanced;

        if (startFn) {
            const stop = await startFn(port, scenario);
            console.log(`Server started on port ${port} for scenario: ${scenario}`);

            // Handle shutdown
            const shutdown = async () => {
                if (stop) await stop();
                process.exit(0);
            };

            process.on("SIGTERM", shutdown);
            process.on("SIGINT", shutdown);

        } else {
            console.error(`Module ${caseFile} does not export startAdvanced function`);
            process.exit(1);
        }
    } catch (err) {
        console.error("Advanced worker error loading module:", caseFile);
        console.error("Scenario:", scenario);
        console.error("Error details:", err);
        if (err instanceof Error) {
            console.error("Error message:", err.message);
            console.error("Stack trace:", err.stack);
        }
        process.exit(1);
    }
}

main();
