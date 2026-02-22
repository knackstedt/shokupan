import type { Server, Socket } from "socket.io";

import { ShokupanContext } from "../../context";
import type { Shokupan } from "../../shokupan";
import { ShokupanRequest } from "../../util/request";
import { $ws } from '../../util/symbol';

/**
 * Attaches the Shokupan HTTP Bridge and Event System to a Socket.IO server.
 * This makes the Shokupan HTTP APIs accessible via Socket.IO events.
 * 
 * Send events as `shokupan:request` events with the payload { type: "http", id: "123", body: {} }.
 * 
 * Responses are emitted as `shokupan:response` events with the payload { id, status, body }
 * 
 * @param io The Socket.IO server instance
 * @param app The Shokupan application instance
 */
export function attachSocketIOBridge(io: Server, app: Shokupan) {
    io.on("connection", (socket: Socket) => {

        // 1. Event Handling (Wildcard)
        // ... (lines 15-41 omitted comments for brevity if needed, but keeping logic)

        socket.onAny(async (event: string, ...args: any[]) => {
            // 1. Check if it's an HTTP Bridge request
            if (event === 'shokupan:request' || event === 'http') {
                return;
            }

            // 2. Lookup Handler
            const handler = app.findEvent(event);
            if (handler) {
                const data = args[0]; // Assume first arg is data

                // Construct Context
                const req = new ShokupanRequest({
                    url: `socketio://${app.applicationConfig.hostname || 'localhost'}/event/${event}`,
                    method: 'POST',
                    headers: new Headers({ 'content-type': 'application/json' }),
                    body: JSON.stringify(data)
                });

                const ctx = new ShokupanContext(req as any, (app as any).server);
                (ctx as any)[$ws] = socket;
                (ctx as any).io = io;

                try {
                    for (let i = 0; i < handler.length; i++) {
                        await handler[i](ctx);
                    }
                } catch (e) {
                    await app.runHooks('onError', ctx, e);

                    if (app.applicationConfig['websocketErrorHandler']) {
                        await app.applicationConfig['websocketErrorHandler'](e, ctx);
                    } else {
                        app.logger?.error('Socket.IO', `Error in event ${event}`, e);
                    }
                }
            }
        });

        // 2. HTTP Bridge
        if (app.applicationConfig['enableHttpBridge']) {
            socket.on("shokupan:request", async (payload: any, callback: any) => {
                // ... same logic
                try {
                    const { method, path, headers, body } = payload;
                    // Validate payload...

                    const url = new URL(path, `http://${app.applicationConfig.hostname || 'localhost'}:3000`);
                    const req = new Request(url.toString(), {
                        method,
                        headers,
                        body: typeof body === 'object' ? JSON.stringify(body) : body
                    });

                    const res = await app.fetch(req);

                    let resBody: any = await res.text();
                    try { resBody = JSON.parse(resBody); } catch { }

                    const resHeaders: Record<string, string> = {};
                    res.headers.forEach((v, k) => resHeaders[k] = v);

                    if (typeof callback === 'function') {
                        await callback({
                            status: res.status,
                            headers: resHeaders,
                            body: resBody
                        });
                    } else {
                        socket.emit("shokupan:response", {
                            id: payload.id,
                            status: res.status,
                            headers: resHeaders,
                            body: resBody
                        });
                    }

                } catch (e: any) {
                    if (typeof callback === 'function') {
                        callback({ status: 500, body: { error: e.message } });
                    }
                }
            });
        }
    });
}
