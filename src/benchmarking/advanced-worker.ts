import "reflect-metadata";

async function main() {
    const caseFile = process.env['CASE_FILE'];
    const port = parseInt(process.env['PORT'] || "3000", 10);
    const scenario = process.env['SCENARIO'];

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
