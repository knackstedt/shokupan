import type { ShokupanContext } from "../../../context";
import type { Shokupan } from "../../../shokupan";
import type { ShokupanPlugin, ShokupanPluginOptions } from "../../../util/types";

export interface GracefulShutdownOptions extends ShokupanPluginOptions {
    /**
     * Process signals to listen for.
     * @default ['SIGINT', 'SIGTERM']
     */
    signals?: string[];
    /**
     * Maximum time to wait for active connections to close before forcefully exiting (in ms).
     * @default 30000
     */
    timeout?: number;
    /**
     * If true, will forcefully exit with the signal's corresponding exit code after timeout or clean stop.
     * @default true
     */
    forceExit?: boolean;
}

const signalExitCodes: Record<string, number> = {
    'SIGHUP': 1,
    'SIGINT': 2,
    'SIGQUIT': 3,
    'SIGABRT': 6,
    'SIGTERM': 15,
};

export class GracefulShutdown implements ShokupanPlugin {
    private activeConnections = 0;
    private isShuttingDown = false;
    private options: GracefulShutdownOptions;
    private signalHandlers: Map<string, () => void> = new Map();

    constructor(options: GracefulShutdownOptions = {}) {
        this.options = {
            signals: ['SIGINT', 'SIGTERM'],
            timeout: 30000,
            forceExit: true,
            ...options
        };
    }

    async onInit(app: Shokupan) {
        // Track connections
        app.use(async (ctx: ShokupanContext<any>, next: any) => {
            if (this.isShuttingDown) {
                ctx.response.status = 503;
                ctx.response.headers.set('Connection', 'close');
                return ctx.text('Service Unavailable - Shutting down');
            }
            this.activeConnections++;
            try {
                return await next();
            } finally {
                if (this.activeConnections > 0) {
                    this.activeConnections--;
                }
            }
        });

        const signals = this.options.signals || [];
        for (const signal of signals) {
            const handler = () => this.handleSignal(signal, app);
            this.signalHandlers.set(signal, handler);
            process.on(signal as any, handler);
        }
    }

    private async handleSignal(signal: string, app: Shokupan) {
        if (this.isShuttingDown) return; // Ignore subsequent signals
        this.isShuttingDown = true;
        app.logger?.info('GracefulShutdown', `Received ${signal}, starting graceful shutdown...`);

        // Unregister all signal handlers to prevent multiple shutdowns or hangs
        for (const [sig, handler] of this.signalHandlers) {
            process.removeListener(sig as any, handler);
        }
        this.signalHandlers.clear();

        const timeout = this.options.timeout || 30000;
        const exitCode = 128 + (signalExitCodes[signal] || 0);

        const startTime = Date.now();
        while (this.activeConnections > 0) {
            if (Date.now() - startTime >= timeout) {
                app.logger?.warn('GracefulShutdown', `Graceful shutdown timed out after ${timeout}ms. Forcing shutdown with ${this.activeConnections} active connections.`);
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }

        try {
            // Call app.stop() which will also run all @OnStop and onStop router hooks
            await app.stop(false);
            app.logger?.info('GracefulShutdown', `Server stopped cleanly.`);
        } catch (err) {
            app.logger?.error('GracefulShutdown', `Error during graceful shutdown`, { error: err });
        }

        if (this.options.forceExit !== false) {
            app.logger?.info('GracefulShutdown', `Exiting process with code ${exitCode}`);
            process.exit(exitCode);
        }
    }
}
