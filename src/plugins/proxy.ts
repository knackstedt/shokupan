import type { ServerWebSocket } from "bun";
import type { ShokupanContext } from "../context";
import type { Middleware, NextFn } from "../types";

export interface ProxyOptions {
    target: string;
    pathRewrite?: (path: string) => string;
    changeOrigin?: boolean;
    ws?: boolean;
    headers?: Record<string, string>;
}

export function Proxy(options: ProxyOptions): Middleware {
    const targetUrl = new URL(options.target);

    return async (ctx: ShokupanContext, next: NextFn) => {
        const req = ctx.request;

        // WebSocket Upgrade Handling
        if (options.ws && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
            const success = ctx.server?.upgrade(req as unknown as Request, {
                data: {
                    handler: {
                        open: (ws: ServerWebSocket) => handleWSOpen(ws, ctx, options, targetUrl),
                        message: (ws: ServerWebSocket, message: any) => handleWSMessage(ws, message),
                        close: (ws: ServerWebSocket, code: number, reason: string) => handleWSClose(ws, code, reason),
                        drain: (ws: ServerWebSocket) => handleWSDrain(ws)
                    }
                }
            });

            if (success) {
                // Return undefined to stop the middleware chain, as the connection is upgraded
                return undefined;
            }
        }

        // HTTP Proxy Handling
        let path = ctx.url.pathname;
        if (options.pathRewrite) {
            path = options.pathRewrite(path);
        }

        const url = new URL(path + ctx.url.search, targetUrl);

        const headers = new Headers(req.headers);
        if (options.changeOrigin) {
            headers.set("host", targetUrl.host);
        }
        if (options.headers) {
            Object.entries(options.headers).forEach(([key, value]) => headers.set(key, value));
        }

        // Remove hop-by-hop headers
        headers.delete("connection");
        headers.delete("keep-alive");
        headers.delete("proxy-authenticate");
        headers.delete("proxy-authorization");
        headers.delete("te");
        headers.delete("trailer");
        headers.delete("transfer-encoding");
        headers.delete("upgrade");


        const proxyReq = new Request(url.toString(), {
            method: req.method,
            headers: headers,
            body: req.body,
            // @ts-ignore - duplex is needed for some node/bun versions for streaming bodies
            duplex: "half"
        });

        const res = await fetch(proxyReq);

        return new Response(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers
        });
    };
}

// WebSocket Proxy Logic
const wsMap = new WeakMap<ServerWebSocket, WebSocket>();

function handleWSOpen(ws: ServerWebSocket, ctx: ShokupanContext, options: ProxyOptions, targetUrl: URL) {
    let path = ctx.url.pathname;
    if (options.pathRewrite) {
        path = options.pathRewrite(path);
    }
    const url = new URL(path + ctx.url.search, targetUrl);
    url.protocol = targetUrl.protocol.replace('http', 'ws');

    const headers: Record<string, string> = {};
    if (options.changeOrigin) {
        headers['Host'] = targetUrl.host;
    }
    // Copy headers from client request
    ctx.request.headers.forEach((v, k) => {
        if (!['upgrade', 'connection', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions'].includes(k.toLowerCase())) {
            headers[k] = v;
        }
    });

    const upstream = new WebSocket(url.toString(), {
        headers
    });

    wsMap.set(ws, upstream);

    const pendingMessages: any[] = [];
    let isConnected = false;

    upstream.onopen = () => {
        isConnected = true;
        // Float pending messages
        while (pendingMessages.length > 0) {
            const msg = pendingMessages.shift();
            upstream.send(msg);
        }
    };

    upstream.onmessage = (event) => {
        ws.send(event.data);
    };

    upstream.onclose = (event) => {
        ws.close(event.code, event.reason);
    };

    upstream.onerror = (err) => {
        console.error("Upstream WebSocket error:", err);
        ws.close(1011, "Internal Error");
    };

    // Store pending buffer on the upstream socket object temporarily or closure? 
    // Closure is fine since we have one upstream per ws.
    // Wait, we need to handle if `ws` sends message before `upstream` is open.
    (upstream as any)._pendingRequestMessages = pendingMessages;
    (upstream as any)._isConnected = () => isConnected;
}

function handleWSMessage(ws: ServerWebSocket, message: any) {
    const upstream = wsMap.get(ws);
    if (!upstream) return;

    if ((upstream as any)._isConnected && (upstream as any)._isConnected()) {
        upstream.send(message);
    } else {
        (upstream as any)._pendingRequestMessages.push(message);
    }
}

function handleWSClose(ws: ServerWebSocket, code: number, reason: string) {
    const upstream = wsMap.get(ws);
    if (upstream) {
        if (upstream.readyState === WebSocket.OPEN) {
            upstream.close(code, reason);
        }
        wsMap.delete(ws);
    }
}

function handleWSDrain(ws: ServerWebSocket) {
    // Optional: Handle backpressure
}
