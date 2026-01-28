import { parentPort, workerData } from 'worker_threads';

/**
 * Worker thread script for AST analysis.
 * This runs in a separate thread to avoid blocking the main event loop.
 */
async function runAnalysis() {
    try {
        const { rootDir, entrypoint } = workerData;

        // Send progress update
        parentPort?.postMessage({ type: 'progress', message: 'Starting AST analysis...' });

        // Dynamically import the analyzer implementation
        const { OpenAPIAnalyzer } = await import('../plugins/application/openapi/analyzer');

        parentPort?.postMessage({ type: 'progress', message: 'Initializing TypeScript compiler...' });

        // Create analyzer instance
        const analyzer = new OpenAPIAnalyzer(rootDir, entrypoint);

        parentPort?.postMessage({ type: 'progress', message: 'Analyzing source files...' });

        // Run analysis
        const result = await analyzer.analyze();

        parentPort?.postMessage({ type: 'progress', message: 'Analysis complete!' });

        // Send result back to main thread
        parentPort?.postMessage({ type: 'result', data: result });
    } catch (error: any) {
        // Send error back to main thread
        parentPort?.postMessage({
            type: 'error',
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name
            }
        });
        process.exit(1);
    }
}

// Start analysis
runAnalysis();
