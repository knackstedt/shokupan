import type { ServerWebSocket } from "bun";
import type { ShokupanContext } from "../../context";
import type { Middleware, NextFn } from "../../util/types";

export interface ProxyOptions {
    /**
     * Target URL to proxy requests to.
     */
    target: string;
    /**
     * Function to rewrite the path of the request.
     */
    pathRewrite?: (path: string) => string;
    /**
     * Whether to change the origin of the request.
     */
    changeOrigin?: boolean;
    /**
     * Whether to proxy WebSocket connections.
     */
    ws?: boolean;
    /**
     * Additional headers to send with the request.
     */
    headers?: Record<string, string>;
    /**
     * Whitelist of allowed target hosts.
     */
    allowedHosts?: string[];
    /**
     * Whether to allow private IPs (disabled by default).
     */
    allowPrivateIPs?: boolean;
}


/**
 * Security: Validate if an IP address is in a private range
 */
function isPrivateIP(ip: string): boolean {
    // IPv4 private ranges
    const ipv4Patterns = [
        /^10\./,                          // 10.0.0.0/8
        /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12
        /^192\.168\./,                     // 192.168.0.0/16
        /^127\./,                          // 127.0.0.0/8 (loopback)
        /^169\.254\./,                     // 169.254.0.0/16 (link-local)
        /^0\.0\.0\.0$/,                    // 0.0.0.0
    ];

    // IPv6 private ranges (simplified)
    const ipv6Patterns = [
        /^::1$/,           // loopback
        /^fe80:/,          // link-local
        /^fc00:/,          // unique local
        /^fd00:/,          // unique local
    ];

    for (const pattern of ipv4Patterns) {
        if (pattern.test(ip)) return true;
    }

    for (const pattern of ipv6Patterns) {
        if (pattern.test(ip.toLowerCase())) return true;
    }

    return false;
}

/**
 * Proxy middleware. This will proxy requests that match the path to the target URL.
 * @param options Proxy options
 * @returns Middleware function
 */
export function Proxy(options: ProxyOptions): Middleware {
    const targetUrl = new URL(options.target);

    // Security: Validate target URL
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        throw new Error('Invalid proxy target protocol. Only http and https are allowed.');
    }

    // Security: Validate hostname is in allowlist (if provided)
    if (options.allowedHosts && options.allowedHosts.length > 0) {
        if (!options.allowedHosts.includes(targetUrl.hostname)) {
            throw new Error(`Target hostname ${targetUrl.hostname} is not in the allowed hosts list.`);
        }
    }

    // Security: Check if target is private IP (unless explicitly allowed)
    if (!options.allowPrivateIPs && isPrivateIP(targetUrl.hostname)) {
        throw new Error('Proxying to private IP addresses is not allowed.');
    }

    return async (ctx: ShokupanContext, next: NextFn) => {
        const req = ctx.request;

        // WebSocket Upgrade Handling
        if (options.ws && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
            const upgradeHeaders: Record<string, string> = {};
            const protocol = req.headers.get("sec-websocket-protocol");
            if (protocol) {
                upgradeHeaders["Sec-WebSocket-Protocol"] = protocol;
            }

            const success = ctx.upgrade({
                headers: upgradeHeaders,
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

        // Security: Re-validate the final URL after pathRewrite in case the rewrite function
        // returned an absolute URL that bypasses the construction-time allowlist check.
        if (!['http:', 'https:'].includes(url.protocol)) {
            return ctx.text('Invalid protocol in proxied URL', 400);
        }
        if (options.allowedHosts && !options.allowedHosts.includes(url.hostname)) {
            return ctx.text('Proxied hostname not in allowlist', 403);
        }

        const headers = new Headers(req.headers);
        if (options.changeOrigin) {
            headers.set("host", targetUrl.host);
            if (headers.has("origin")) {
                headers.set("origin", targetUrl.origin);
            }
        }
        if (options.headers) {
            Object.entries(options.headers).forEach(([key, value]) => headers.set(key, value));
        }

        // Remove hop-by-hop headers
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
    // Copy headers from client request
    ctx.request.headers.forEach((v, k) => {
        if (!['upgrade', 'connection', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions'].includes(k.toLowerCase())) {
            headers[k] = v;
        }
    });

    if (options.changeOrigin) {
        headers['host'] = targetUrl.host;
        headers['origin'] &&= targetUrl.origin;
    }

    const protocolHeader = headers['sec-websocket-protocol'] || ctx.request.headers.get('sec-websocket-protocol');
    const protocols = protocolHeader ? protocolHeader.split(',').map(p => p.trim()) : undefined;

    // @ts-ignore - Bun's native WebSocket supports options mapping as the 3rd argument.
    const upstream = new WebSocket(url.toString(), protocols, { headers });

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
        ctx.app?.logger?.error('Proxy', 'Upstream WebSocket error', err);
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
