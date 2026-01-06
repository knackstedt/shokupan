import cluster from 'node:cluster';
import net from 'node:net';
import os from 'node:os';
import type { Shokupan } from '../../shokupan';
import type { ShokupanPlugin } from '../../util/types';

export interface ClusterOptions {
    /**
     * Number of workers to spawn.
     * Set to -1 or 'auto' to spawn one worker per available CPU.
     * @default 'auto'
     */
    workers?: number | 'auto';

    /**
     * Whether to pipe stdout/stderr to the parent process.
     * @default false
     */
    silent?: boolean;

    /**
     * Enable sticky sessions (useful for Socket.io).
     * Currently only supported in Node.js runtime.
     * @default false
     */
    sticky?: boolean;
}

/**
 * Cluster Plugin
 * 
 * Automatically manages clustering for Node.js and Bun.
 */
export class ClusterPlugin implements ShokupanPlugin {
    constructor(private options: ClusterOptions = {}) { }

    onInit(app: Shokupan) {
        const originalListen = app.listen.bind(app);
        const { workers = 'auto', silent = false, sticky = false } = this.options;
        const isBun = typeof Bun !== 'undefined';
        const numCPUs = os.cpus().length;
        const numWorkers = (workers === 'auto' || workers === -1) ? numCPUs : workers;

        if (numWorkers <= 1) {
            // No clustering needed
            return;
        }

        app.listen = async (port?: number) => {
            const finalPort = port ?? app.applicationConfig.port ?? 3000;

            if (isBun) {
                return this.handleBun(app, finalPort, numWorkers, originalListen);
            } else {
                return this.handleNode(app, finalPort, numWorkers, originalListen, silent, sticky);
            }
        };
    }

    private async handleBun(app: Shokupan, port: number, workers: number, originalListen: Function) {
        // We use Bun's native behavior where multiple processes share the port via SO_REUSEPORT (reusePort: true).

        // Check if we are a worker
        const workerId = process.env['SHOKUPAN_WORKER_ID'];

        if (workerId) {
            // WORKER MODE
            // Force reusePort to true
            app.applicationConfig.reusePort = true;
            return originalListen(port);
        }

        // PRIMARY MODE
        console.log(`[Cluster] Starting ${workers} Bun workers on port ${port}...`);

        const spawnWorker = (id: string) => {
            // In Bun, we re-run the same script.
            // We must ensure arguments are passed correctly.
            Bun.spawn([process.argv0, ...process.argv.slice(1)], {
                env: { ...process.env, SHOKUPAN_WORKER_ID: id },
                stdio: ['inherit', 'inherit', 'inherit'],
                onExit(proc, exitCode, signalCode, error) {
                    console.log(`[Cluster] Worker ${id} died (code: ${exitCode}). Restarting...`);
                    spawnWorker(id);
                }
            });
        };

        for (let i = 0; i < workers; i++) {
            spawnWorker(process.pid + '_' + i + 1);
        }

        // Keep primary alive
        // in Bun, if simply returning, the script might exit if no event loop.
        // We just set an interval to ensure Bun doesn't exit.
        setInterval(() => { }, 1000 * 60 * 60);

        // Return a dummy object to satisfy Promise<Server> signature if needed, 
        // though app.listen returns Server.
        return {
            stop: () => { },
            port
        } as any;
    }

    private async handleNode(app: Shokupan, port: number, workers: number, originalListen: Function, silent: boolean, sticky: boolean) {
        if (cluster.isPrimary) {
            console.log(`[Cluster] Master ${process.pid} is running`);

            // Fork workers
            const fork = () => cluster.fork(process.env);

            for (let i = 0; i < workers; i++) {
                fork();
            }

            cluster.on('exit', (worker, code, signal) => {
                console.log(`[Cluster] Worker ${worker.process.pid} died. Restarting...`);
                fork();
            });

            if (sticky) {
                // Sticky Session Master Logic
                // Create a net server to pause connections and distribute them
                const server = net.createServer({ pauseOnConnect: true }, (connection) => {
                    const remote = connection.remoteAddress || '';
                    // Simple hash
                    let hash = 0;
                    for (let i = 0; i < remote.length; i++) {
                        hash = (hash << 5) - hash + remote.charCodeAt(i);
                        hash |= 0;
                    }
                    const index = Math.abs(hash) % workers;

                    // Get worker
                    const worker = Object.values(cluster.workers!)[index];
                    if (worker) {
                        worker.send('sticky-session:connection', connection);
                    } else {
                        connection.end();
                    }
                });

                server.listen(port, () => {
                    console.log(`[Cluster] Sticky Load Balancer listening on port ${port}`);
                });

                // Return dummy server
                return {
                    close: () => server.close(),
                    port
                } as any;
            } else {
                // Standard Cluster (Round Robin by Node)
                // Master doesn't need to listen, workers will listen on the same port.
                // Node cluster handles the port sharing.
                return {
                    close: () => { }, // Master controls
                    port
                } as any;
            }

        } else {
            // WORKER MODE
            if (sticky) {
                // Sticky Worker Logic
                // We shouldn't listen on the PORT, because the master does.
                // We listen on 0 (random/ephemeral) just to initialize the internal http server.
                // Then we intercept messages.

                // Call listen with 0 to start server without binding public port
                const server = await originalListen(0);

                process.on('message', (message, handle) => {
                    if (message !== 'sticky-session:connection') return;
                    if (!handle) return;

                    // Emulate connection 
                    (server as any).emit('connection', handle);
                    // Connection was paused by master, resume it
                    (handle as any).resume();
                });
                return server;
            } else {
                // Standard Worker
                return originalListen(port);
            }
        }
    }
}
