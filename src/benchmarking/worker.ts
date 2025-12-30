import "reflect-metadata";

async function main() {
    const caseFile = process.env.CASE_FILE;
    const port = parseInt(process.env.PORT || "3000", 10);

    if (!caseFile) {
        console.error("No CASE_FILE provided");
        process.exit(1);
    }

    try {
        console.log(`Worker loading ${caseFile}`);
        // Dynamic import works in bun and node (modern)
        // For CJS node, this returns a promise with the module.
        const mod = await import(caseFile);
        const startFn = mod.start || mod.default?.start;

        if (startFn) {
            const stop = await startFn(port);
            console.log(`Server started on port ${port}`);

            // Handle shutdown
            const shutdown = async () => {
                if (stop) await stop();
                process.exit(0);
            };

            process.on("SIGTERM", shutdown);
            process.on("SIGINT", shutdown);

        } else {
            console.error(`Module ${caseFile} does not export start function`);
            process.exit(1);
        }
    } catch (err) {
        console.error("Worker error:", err);
        process.exit(1);
    }
}

main();
