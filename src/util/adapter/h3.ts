
import type { Server } from "bun";
import type { Shokupan } from "../../shokupan";
import type { ServerAdapter } from "./interface";

export class H3Adapter implements ServerAdapter {
    private nodeServer?: any;

    async listen(port: number, app: Shokupan): Promise<Server<any>> {
        // Dynamically import h3 to make it optional
        let h3Module: any;
        let toNodeHandler: any;

        try {
            h3Module = await import('h3');
            const h3Node = await import('h3/node');
            toNodeHandler = h3Node.toNodeHandler;
        } catch (err) {
            throw new Error(
                'H3 adapter requires the "h3" package to be installed. ' +
                'Install it with: bun add h3 or npm install h3'
            );
        }

        const { H3 } = h3Module;

        // Create H3 app instance
        const h3App = new H3();

        // Create faux server object for Shokupan's fetch method
        let fauxServer: Server<any>;

        // Single handler that passes everything to Shokupan
        // We return the Response object directly, letting H3 handle the streaming/writing
        h3App.use(async (event: any) => {
            const req = event.node.req;

            // Build URL
            const protocol = 'http';
            const host = req.headers.host || `localhost:${port}`;
            const url = `${protocol}://${host}${req.url}`;

            // Build Request object
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers)) {
                if (value) {
                    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
                }
            }

            const hasBody = !['GET', 'HEAD'].includes(req.method!) && req.method !== 'OPTIONS';

            const request = new Request(url, {
                method: req.method,
                headers,
                // Node Readable stream as body for Web Request
                body: hasBody ? new ReadableStream({
                    start(controller) {
                        req.on('data', (chunk: Buffer) => controller.enqueue(chunk));
                        req.on('end', () => controller.close());
                        req.on('error', (err: Error) => controller.error(err));
                    }
                }) as any : undefined,
                // @ts-ignore
                duplex: hasBody ? 'half' : undefined
            } as any);

            // Call Shokupan's fetch handler
            const response = await app.fetch(request, fauxServer);

            // Return the Web Response directly to H3
            return response;
        });

        // Create Node.js server using h3's toNodeHandler
        const http = await import('node:http');
        this.nodeServer = http.createServer(toNodeHandler(h3App));

        // Create faux server object to match Bun.Server interface
        fauxServer = {
            stop: () => {
                return new Promise<void>((resolve) => {
                    this.nodeServer.close(() => resolve());
                });
            },
            upgrade(req, options) {
                return false;
            },
            reload(options) {
                return fauxServer as any;
            },
            get port() {
                const addr = this.nodeServer.address();
                if (typeof addr === 'object' && addr !== null) {
                    return addr.port;
                }
                return port;
            },
            hostname: app.applicationConfig.hostname || 'localhost',
            development: app.applicationConfig.development || false,
            pendingRequests: 0,
            requestIP: (req) => null,
            publish: () => 0,
            subscriberCount: () => 0,
            url: new URL(`http://${app.applicationConfig.hostname || 'localhost'}:${port}`),
            // @ts-ignore - Expose the H3 app and Node server for advanced usage
            h3App,
            nodeServer: this.nodeServer
        } as unknown as Server<any>;

        // Listen
        return new Promise((resolve) => {
            this.nodeServer.listen(port, app.applicationConfig.hostname, () => {
                resolve(fauxServer);
            });
        });
    }

    async stop() {
        if (this.nodeServer) {
            return new Promise<void>((resolve) => {
                this.nodeServer.close(() => resolve());
            });
        }
    }
}
