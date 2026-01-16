import type { Server } from "bun";
import { ShokupanContext } from "../../context";
import { compose } from "../../middleware";
import { createHttpServer } from "../../plugins/application/http-server";
import type { Shokupan } from "../../shokupan";
import { ShokupanRequest } from "../request";
import { $ws } from "../symbol";

export interface ServerAdapter {
    listen(port: number, app: Shokupan): Promise<any>;
    stop?(): Promise<void>;
}

export class BunAdapter implements ServerAdapter {
    private server?: Server<any>;

    async listen(port: number, app: Shokupan): Promise<Server<any>> {
        // @ts-ignore
        if (typeof Bun === "undefined") {
            throw new Error("BunAdapter requires the Bun runtime.");
        }

        const serveOptions = {
            port: port,
            hostname: app.applicationConfig.hostname,
            development: app.applicationConfig.development,
            fetch: app.fetch.bind(app),
            reusePort: app.applicationConfig.reusePort,
            idleTimeout: app.applicationConfig.readTimeout ? app.applicationConfig.readTimeout / 1000 : undefined,
            websocket: {
                // @ts-ignore
                open(ws) {
                    ws.data?.handler?.open?.(ws);
                },
                // @ts-ignore
                async message(ws, message) {
                    if (ws.data?.handler?.message) {
                        return ws.data.handler.message(ws, message);
                    }

                    // Buffer vs Uint8Array handling for cross-platform compatibility
                    let msgString: string = "";
                    if (typeof message === "string") {
                        msgString = message;
                    } else if (message instanceof Uint8Array || message instanceof ArrayBuffer) {
                        msgString = new TextDecoder().decode(message);
                    } else if (typeof Buffer !== "undefined" && message instanceof Buffer) {
                        // @ts-ignore
                        msgString = message.toString();
                    } else {
                        return; // Unknown format
                    }

                    if (typeof msgString !== "string") return;

                    let payload: any;
                    let isJSONPayload = false;
                    if (msgString.startsWith('{')) {
                        try {
                            payload = JSON.parse(msgString);
                            isJSONPayload = true;
                        } catch { /* Ignore JSON parsing errors */ }
                    }

                    if (payload) {
                        const self = app;
                        // HTTP Bridge
                        if (isJSONPayload && self.applicationConfig['enableHttpBridge'] && payload.type === 'HTTP') {
                            const { id, method, path, headers, body } = payload;
                            const url = new URL(path, `http://${self.applicationConfig.hostname || 'localhost'}:${port}`);

                            const req = new Request(url.toString(), {
                                method,
                                headers,
                                body: typeof body === 'object' ? JSON.stringify(body) : body
                            });

                            const res = await self.fetch(req);

                            const resBody: any = await res.json()
                                .catch(err => res.text());

                            const resHeaders: Record<string, string> = {};
                            res.headers.forEach((v, k) => resHeaders[k] = v);

                            ws.send(JSON.stringify({
                                type: 'RESPONSE',
                                id,
                                status: res.status,
                                headers: resHeaders,
                                body: resBody
                            }));
                            return;
                        }

                        // Event Handling
                        const eventName = payload.event || (payload.type === 'EVENT' ? payload.name : undefined);
                        if (eventName) {
                            const handlers = self.findEvent(eventName);
                            const handler = handlers?.length == 1 ? handlers[0] : compose(handlers || []);
                            if (handler) {
                                const data = payload.data || payload.body || payload.payload || payload;

                                // Construct a Context that mocks a Request
                                const req = new ShokupanRequest({
                                    url: `http://${self.applicationConfig.hostname || 'localhost'}/event/${eventName}`,
                                    method: 'POST',
                                    headers: new Headers({ 'content-type': 'application/json' }),
                                    body: JSON.stringify(data)
                                });

                                const ctx = new ShokupanContext(
                                    // @ts-ignore
                                    req,
                                    // @ts-ignore
                                    self.server,
                                    {},
                                    self,
                                    null,
                                    self.applicationConfig.enableMiddlewareTracking,
                                    payload.id
                                );
                                // Expose socket on context for reply
                                (ctx as any)[$ws] = ws;

                                // Link context to socket for disconnect hooks
                                ws.data ??= {} as any;
                                ws.data['ctx'] = ctx;

                                try {
                                    await handler(ctx as any);
                                } catch (err) {
                                    if (self.applicationConfig['websocketErrorHandler']) {
                                        await self.applicationConfig['websocketErrorHandler'](err, ctx as any);
                                    } else {
                                        console.error(`Error in event ${eventName}:`, err);
                                    }
                                }
                            }
                        }
                    }
                },
                // @ts-ignore
                drain(ws) {
                    ws.data?.handler?.drain?.(ws);
                },
                // @ts-ignore
                close(ws, code, reason) {
                    ws.data?.handler?.close?.(ws, code, reason);
                    // Shokupan Disconnect Hooks
                    const ctx: any = ws.data?.['ctx'];
                    if (ctx && typeof ctx.getDisconnectCallbacks === 'function') {
                        const callbacks = ctx.getDisconnectCallbacks();
                        if (Array.isArray(callbacks) && callbacks.length > 0) {
                            Promise.all(callbacks.map((cb: Function) => cb())).catch(err => {
                                console.error("Error executing socket disconnect hook:", err);
                            });
                        }
                    }
                }
            }
        };

        // @ts-ignore
        this.server = Bun.serve(serveOptions);
        return this.server!;
    }

    async stop() {
        if (this.server) {
            this.server.stop();
        }
    }
}

export class NodeAdapter implements ServerAdapter {
    private server?: any;

    async listen(port: number, app: Shokupan): Promise<any> {
        let factory = app.applicationConfig.serverFactory;

        if (!factory) {
            factory = createHttpServer();
        }

        const serveOptions = {
            port: port,
            hostname: app.applicationConfig.hostname,
            development: app.applicationConfig.development,
            fetch: app.fetch.bind(app),
            reusePort: app.applicationConfig.reusePort,
            // Node adapter might not support all options exactly the same
        };

        this.server = await factory(serveOptions);
        return this.server;
    }

    async stop() {
        if (this.server?.stop) {
            await this.server.stop();
        }
    }
}

export class WinterCGAdapter implements ServerAdapter {
    async listen(port: number, app: Shokupan): Promise<any> {
        console.warn("WinterCGAdapter does not support 'listen()'. Use 'export default app' or invoke 'app.fetch' directly.");
        return {};
    }
}
