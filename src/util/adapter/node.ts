
import type { Server } from "bun";
import * as http from "node:http";
import * as https from "node:https";
import type { Shokupan } from "../../shokupan";
import type { ServerAdapter } from "./interface";

export class NodeAdapter implements ServerAdapter {
    private server?: any;

    async listen(port: number, app: Shokupan, tls?: { key: string; cert: string; }): Promise<Server<any>> {
        let nodeServer: http.Server | https.Server;

        // Standard Node.js implementation
        const handler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
            const url = new URL(req.url!, `http://${req.headers.host}`);
            const request = new Request(url.toString(), {
                method: req.method,
                headers: req.headers as any,
                body: ['GET', 'HEAD'].includes(req.method!) ? undefined : new ReadableStream({
                    start(controller) {
                        req.on('data', chunk => controller.enqueue(chunk));
                        req.on('end', () => controller.close());
                        req.on('error', err => controller.error(err));
                    }
                }) as any,
                // Required for Node.js undici when sending a body
                // @ts-ignore
                duplex: 'half'
            } as any);

            // Create faux server inside handler or borrow from outside
            const response = await app.fetch(request, fauxServer);

            res.statusCode = response.status;
            response.headers.forEach((v, k) => res.setHeader(k, v));

            // Optimized Stream Handling
            const nodeStream = (response as any).nodeStream;
            if (nodeStream) {
                if (typeof nodeStream.pipe === 'function') {
                    nodeStream.pipe(res);
                } else {
                    // Fallback if not a stream?
                    nodeStream.pipe(res);
                }
                return;
            }

            if (response.body) {
                if (response.body instanceof ReadableStream) {
                    // @ts-ignore - Readable.fromWeb exists in Node 18+
                    const { Readable } = await import('node:stream');
                    Readable.fromWeb(response.body as any).pipe(res);
                } else {
                    // Optimize: Use arrayBuffer for direct conversion
                    const buffer = await response.arrayBuffer();
                    res.end(Buffer.from(buffer));
                }
            } else {
                res.end();
            }
        };

        if (tls) {
            nodeServer = https.createServer(tls, handler);
        } else {
            nodeServer = http.createServer(handler);
        }

        // Store reference
        this.server = nodeServer;

        // Create faux server object to match Bun.Server interface
        const fauxServer: Server<any> = {
            stop: () => {
                nodeServer.close();
                return Promise.resolve();
            },
            upgrade(req, options) {
                return false;
            },
            reload(options) {
                return fauxServer as any;
            },
            get port() {
                const addr = nodeServer.address();
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
            // Expose the raw Node.js server
            // @ts-ignore
            nodeServer: nodeServer
        } as unknown as Server<any>;

        // Listen
        return new Promise((resolve) => {
            nodeServer.listen(port, app.applicationConfig.hostname, () => {
                resolve(fauxServer);
            });
        });
    }

    async stop() {
        if (this.server?.stop) {
            await this.server.stop();
        } else if (this.server?.close) {
            // If we stored the raw node server
            this.server.close();
        }
    }
}
