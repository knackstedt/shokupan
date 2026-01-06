import type { Server } from "bun";
import * as http from "node:http";
import * as https from "node:https";
import type { ServerFactory } from "../../util/types";

/**
 * Creates a server factory that uses the standard Node.js `http` module.
 * @returns A ServerFactory compatible with Shokupan.
 */
export function createHttpServer(): ServerFactory {
    return async (options: any): Promise<Server> => {
        const server = http.createServer(async (req, res) => {
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
                duplex: 'half'
            } as any);

            const response = await options.fetch(request, fauxServer);

            res.statusCode = response.status;
            response.headers.forEach((v, k) => res.setHeader(k, v));

            if (response.body) {
                // Optimize: Use arrayBuffer for direct conversion instead of async iteration
                const buffer = await response.arrayBuffer();
                res.end(Buffer.from(buffer));
            } else {
                res.end();
            }
        });

        const fauxServer: Server = {
            stop: () => {
                server.close();
                return Promise.resolve(); // Bun.Server stop usually returns void but in type definition it might vary.
            },
            upgrade(req, options) {
                return false;
            },
            reload(options) {
                return fauxServer as any;
            },
            get port() {
                const addr = server.address();
                if (typeof addr === 'object' && addr !== null) {
                    return addr.port;
                }
                return options.port;
            },
            hostname: options.hostname,
            development: options.development,
            pendingRequests: 0,
            requestIP: (req) => null,
            publish: () => 0,
            subscriberCount: () => 0,
            url: new URL(`http://${options.hostname}:${options.port}`)
        } as unknown as Server;

        return new Promise((resolve) => {
            server.listen(options.port, options.hostname, () => {
                resolve(fauxServer);
            });
        });
    };
}

/**
 * Creates a server factory that uses the standard Node.js `https` module.
 * @param sslOptions - Node.js HTTPS options (key, cert, etc.)
 * @returns A ServerFactory compatible with Shokupan.
 */
export function createHttpsServer(sslOptions: https.ServerOptions): ServerFactory {
    return async (options: any): Promise<Server> => {
        const server = https.createServer(sslOptions, async (req, res) => {
            const url = new URL(req.url!, `https://${req.headers.host}`);
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
                duplex: 'half'
            } as any);

            const response = await options.fetch(request, fauxServer);

            res.statusCode = response.status;
            response.headers.forEach((v, k) => res.setHeader(k, v));

            if (response.body) {
                // Optimize: Use arrayBuffer for direct conversion instead of async iteration
                const buffer = await response.arrayBuffer();
                res.end(Buffer.from(buffer));
            } else {
                res.end();
            }
        });

        const fauxServer: Server = {
            stop: () => {
                server.close();
            },
            upgrade(req, options) {
                return false;
            },
            reload(options) {
                return fauxServer as any;
            },
            get port() {
                const addr = server.address();
                if (typeof addr === 'object' && addr !== null) {
                    return addr.port;
                }
                return options.port;
            },
            hostname: options.hostname,
            development: options.development,
            pendingRequests: 0,
            requestIP: (req) => null,
            publish: () => 0,
            subscriberCount: () => 0,
            url: new URL(`https://${options.hostname}:${options.port}`)
        } as unknown as Server;

        return new Promise((resolve) => {
            server.listen(options.port, options.hostname, () => {
                resolve(fauxServer);
            });
        });
    };
}
