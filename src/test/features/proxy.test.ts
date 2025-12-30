import { describe, expect, test } from "bun:test";
import { Proxy } from "../../plugins/proxy";
import { Shokupan } from "../../shokupan";

describe("Proxy Plugin", () => {
    test("HTTP Proxy", async () => {
        // Target Server
        const targetServer = Bun.serve({
            port: 0,
            fetch(req) {
                const url = new URL(req.url);
                if (url.pathname === "/target") {
                    return new Response("Hello from target");
                }
                return new Response("Not Found", { status: 404 });
            }
        });

        // Proxy Server
        const app = new Shokupan();
        app.use(Proxy({
            target: `http://${targetServer.hostname}:${targetServer.port}`,
            pathRewrite: (path) => path.replace('/proxy', '/target')
        }));

        const server = await app.listen(0);

        const res = await fetch(`http://${server.hostname}:${server.port}/proxy`);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("Hello from target");

        targetServer.stop();
        server.stop();
    });

    test("WebSocket Proxy", async () => {
        // Target WebSocket Server
        const targetServer = Bun.serve({
            port: 0,
            fetch(req, server) {
                if (server.upgrade(req)) {
                    return;
                }
                return new Response("Http fallback");
            },
            websocket: {
                message(ws, message) {
                    ws.send(`Echo: ${message}`);
                }
            }
        });

        // Proxy Server
        const app = new Shokupan();
        app.use(Proxy({
            target: `http://${targetServer.hostname}:${targetServer.port}`,
            ws: true,
            pathRewrite: (path) => path.replace('/proxy', '')
        }));

        const server = await app.listen(0);

        // Client
        const ws = new WebSocket(`ws://${server.hostname}:${server.port}/proxy`);

        const messagePromise = new Promise((resolve) => {
            ws.onmessage = (event) => {
                resolve(event.data);
            };
        });

        ws.onopen = () => {
            ws.send("Hello");
        };

        const response = await messagePromise;
        expect(response).toBe("Echo: Hello");

        ws.close();
        targetServer.stop();
        server.stop();
    });
});
