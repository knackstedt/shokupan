import type { Shokupan } from './shokupan';
import { BunAdapter, NodeAdapter, type ServerAdapter } from './util/adapter';

/**
 * Shokupan Server
 * 
 * Responsible for the lifecycle of the HTTP server (listen, stop)
 * and managing the underlying adapter (Bun, Node, etc).
 */
export class ShokupanServer {
    private server?: any;
    private adapter?: ServerAdapter;

    constructor(private app: Shokupan) { }

    /**
     * Starts the application server.
     * @param port The port to listen on.
     */
    public async listen(port?: number) {
        const config = this.app.applicationConfig;
        const finalPort = port ?? config.port ?? 3000;

        if (finalPort < 0 || finalPort > 65535 || finalPort % 1 !== 0) {
            throw new Error("Invalid port number");
        }

        // Initialize App (Hooks, OpenAPI, etc)
        await this.app.start();

        // Use Adapter
        let adapterName = config.adapter;
        let adapter: ServerAdapter;

        if (!adapterName) {
            // Auto-detect
            // @ts-ignore
            if (typeof Bun !== "undefined") {
                config.adapter = 'bun';
                adapter = new BunAdapter();
            } else {
                config.adapter = 'node';
                adapter = new NodeAdapter();
            }
        } else if (adapterName === 'bun') {
            adapter = new BunAdapter();
        } else if (adapterName === 'node') {
            adapter = new NodeAdapter();
        } else if (adapterName === 'h3') {
            console.warn(
                '[Shokupan] ⚠️  The "h3" adapter is deprecated and has been removed.\n' +
                '   HTTP/3 support is planned for a future release.'
            );
            throw new Error(
                '[Shokupan] H3Adapter is no longer supported. HTTP/3 support is coming in a future release.'
            );
        } else if (adapterName === 'wintercg') {
            throw new Error("WinterCG adapter does not support listen(). Use fetch directly.");
        } else {
            // Default/Fallback
            adapter = new NodeAdapter();
        }

        this.adapter = adapter;

        // Compile Routes (Flattening Optimization) if not done
        this.app.compile();

        // Start Server
        this.server = await adapter.listen(finalPort, this.app);

        // Update config port if 0 was used
        if (finalPort === 0 && this.server?.port) {
            config.port = this.server.port;
        }

        return this.server;
    }

    /**
     * Stops the server.
     */
    public async stop(closeActiveConnections?: boolean) {
        if (this.adapter?.stop) {
            await this.adapter.stop();
        } else if (this.server?.stop) {
            await this.server.stop(closeActiveConnections);
        }
        this.server = undefined;
    }
}
