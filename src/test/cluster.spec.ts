import { afterAll, describe, expect, it } from 'bun:test';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper script that will run the clustered server
const serverScript = `
import { Shokupan, ClusterPlugin } from '../index';

// Prevent master process from exiting immediately in tests if needed (though Bun.serve keeps it alive usually)
// In cluster mode, the master often just orchestrates.

const app = new Shokupan();

// Use 2 workers for the test to ensure we can hit multiple PIDs
app.register(new ClusterPlugin({
    workers: 2,
    silent: true // reduce noise in test output
}));

app.get('/', (ctx) => {
    return ctx.json({ pid: process.pid });
});

// Use a random port (0) to avoid conflicts, but cluster needs a fixed port usually to share it.
// We'll use a fixed port for this test or let the OS assign one and print it.
// However, reusing port via SO_REUSEPORT requires a known port usually.
// Let's try port 45678.
const server = await app.listen(45678);

if (!process.env.SHOKUPAN_WORKER_ID) {
    // Only master prints this
    console.log('READY'); 
}
`;

describe('Cluster Plugin', () => {
    let serverProcess: ReturnType<typeof spawn>;

    afterAll(() => {
        if (serverProcess) {
            serverProcess.kill('SIGTERM');
        }
    });

    it('should spawn workers and distribute requests', async () => {
        // 1. Create a temporary server file
        const testFile = path.join(__dirname, 'cluster-test-server.ts');
        await Bun.write(testFile, serverScript);

        try {
            // 2. Spawn the server process
            // We need to run this with 'bun' command
            serverProcess = spawn('bun', [testFile], {
                cwd: path.join(__dirname, '../'), // Run from src root so imports work
                env: { ...process.env }, // Pass existing env
                stdio: ['ignore', 'pipe', 'inherit'] // We need stdout to wait for READY
            });

            // 3. Wait for server to start
            await new Promise<void>((resolve, reject) => {
                let started = false;
                serverProcess.stdout?.on('data', (data) => {
                    const output = data.toString();
                    if (output.includes('READY')) {
                        started = true;
                        resolve();
                    }
                });

                serverProcess.on('error', reject);
                serverProcess.on('exit', (code) => {
                    if (!started) reject(new Error(`Server exited early with code ${code}`));
                });

                // Timeout after 10s
                setTimeout(() => {
                    if (!started) reject(new Error('Server start timeout'));
                }, 10000);
            });

            // 4. Make concurrent requests with retry logic
            const pids = new Set<number>();
            const totalRequests = 20;

            const fetchWithRetry = async (retries = 30, delay = 100) => {
                for (let i = 0; i < retries; i++) {
                    try {
                        const res = await fetch('http://localhost:45678/');
                        if (!res.ok) throw new Error('Status not ok');
                        return await res.json();
                    } catch (e) {
                        if (i === retries - 1) throw e;
                        await new Promise(r => setTimeout(r, delay));
                    }
                }
            };

            // Fire off requests in parallel to encourage hitting different workers
            const promises = [];
            for (let i = 0; i < totalRequests; i++) {
                promises.push(
                    fetchWithRetry()
                        .then((data: any) => pids.add(data.pid))
                );
            }

            await Promise.all(promises);

            // 5. Verify results
            console.log(`Unique PIDs handled: ${[...pids].join(', ')}`);
            expect(pids.size).toBeGreaterThan(1); // Should have hit at least 2 different process IDs

        } finally {
            // Cleanup
            if (serverProcess) serverProcess.kill();
            await Bun.write(testFile, ''); // Clear content or delete
            // await fs.unlinkOnExit... Bun doesn't have unlinkOnExit but we could try to unlink
        }
    }, 15000); // Increase timeout for spawn overhead
});
