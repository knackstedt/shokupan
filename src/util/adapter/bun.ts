
import type { Server, ServerWebSocket } from "bun";
import { ShokupanContext } from "../../context";
import { compose } from "../../middleware";
import type { Shokupan } from "../../shokupan";
import { ShokupanRequest } from "../request";
import { $ws } from "../symbol";
import type { ServerAdapter } from "./interface";

export class BunAdapter implements ServerAdapter {
    private server?: Server<any>;

    async listen(port: number, app: Shokupan, tls?: { key: string; cert: string; }): Promise<Server<any>> {
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
                open(ws: ServerWebSocket<any>) {
                    ws.data?.handler?.open?.(ws);
                },
                async message(ws: ServerWebSocket<any>, message: string | ArrayBuffer | Uint8Array) {
                    // Buffer vs Uint8Array handling for cross-platform compatibility
                    let msgString: string = "";
                    if (typeof message === "string") {
                        msgString = message;
                    } else if (message instanceof Uint8Array || message instanceof ArrayBuffer) {
                        msgString = new TextDecoder().decode(message);
                    } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(message)) {
                        msgString = (message as Buffer).toString();
                    }

                    let payload: any;
                    let isJSONPayload = false;
                    if (typeof msgString === "string" && msgString.startsWith('{')) {
                        try {
                            payload = JSON.parse(msgString);
                            isJSONPayload = true;
                        } catch { /* Ignore JSON parsing errors */ }
                    }

                    const self = app;
                    // HTTP Bridge - Check BEFORE custom handler
                    if (isJSONPayload && self.applicationConfig['enableHTTPBridge'] && payload.type === 'HTTP') {
                        // Security: HTTP Bridge allows arbitrary HTTP execution over WebSocket.
                        // In production, require a shared secret in the payload headers.
                        const bridgeSecret = process.env['SHOKUPAN_HTTP_BRIDGE_SECRET'];
                        const isDev = self.applicationConfig.development;
                        const authHeader = payload.headers?.['Authorization'] || payload.headers?.['authorization'];
                        const providedSecret = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
                        if (!isDev && (!bridgeSecret || providedSecret !== bridgeSecret)) {
                            ws.send(JSON.stringify({ type: 'ERROR', id: payload.id, error: 'HTTP Bridge authentication required' }));
                            return;
                        }

                        const { id, method, path, headers, body } = payload;
                        // Use 127.0.0.1 to avoid localhost lookup issues in some environments, though localhost is usually fine
                        const hostname = self.applicationConfig.hostname || 'localhost';
                        const url = new URL(path, `http://${hostname}:${port}`);

                        const req = new Request(url.toString(), {
                            method,
                            headers,
                            body: typeof body === 'object' ? JSON.stringify(body) : body
                        });

                        const res = await self.fetch(req);
                        if (!res) return;

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

                    // Delegate to Custom Handler (if present)
                    if (ws.data?.handler?.message) {
                        return ws.data.handler.message(ws, message);
                    }

                    // Default Event Handling (Shokupan Default Router logic)
                    if (payload) {
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
                                    req,
                                    self.server as Server<any>,
                                    {},
                                    self,
                                    undefined,
                                    self.applicationConfig.enableMiddlewareTracking,
                                    payload.id
                                );
                                // Expose socket on context for reply
                                ctx[$ws] = ws;

                                // Link context to socket for disconnect hooks
                                ws.data ??= {} as Record<string, any>;
                                ws.data['ctx'] = ctx;

                                try {
                                    await handler(ctx);
                                } catch (err) {
                                    if (self.applicationConfig['websocketErrorHandler']) {
                                        await self.applicationConfig['websocketErrorHandler'](err, ctx);
                                    } else {
                                        app.logger?.error('BunAdapter', `Error in event ${eventName}:`, { error: err });
                                    }
                                }
                            }
                        }
                    }
                },
                drain(ws: ServerWebSocket<any>) {
                    ws.data?.handler?.drain?.(ws);
                },
                close(ws: ServerWebSocket<any>, code: number, reason: string) {
                    ws.data?.handler?.close?.(ws, code, reason);
                    // Shokupan Disconnect Hooks
                    const ctx: any = ws.data?.['ctx'];
                    if (ctx && typeof ctx.getDisconnectCallbacks === 'function') {
                        const callbacks = ctx.getDisconnectCallbacks();
                        if (Array.isArray(callbacks) && callbacks.length > 0) {
                            Promise.all(callbacks.map((cb: Function) => cb())).catch(err => {
                                app.logger?.error('BunAdapter', "Error executing socket disconnect hook:", { error: err });
                            });
                        }
                    }
                }
            }
        };

        if (tls) {
            (serveOptions as { tls?: typeof tls }).tls = tls;
        }

        this.server = Bun.serve(serveOptions);
        return this.server!;
    }

    async stop() {
        if (this.server) {
            this.server.stop();
        }
    }
}
