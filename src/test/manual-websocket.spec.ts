import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ShokupanContext } from "../context";
import { Event, WebsocketController } from "../decorators";
import { Shokupan } from "../shokupan";

@WebsocketController("/")
class WebSocketController {
    @Event("ping")
    onPing(ctx: ShokupanContext) {
        // Native WebSocket is exposed on ctx.ws
        ctx.ws?.send(JSON.stringify({ type: "EVENT", event: "pong", data: "pong-data" }));
    }

    @Event("echo")
    async onEcho(ctx: ShokupanContext, data: any) {
        ctx.emit("echo-reply", data);
    }
}

describe("Shokupan WebSocket", () => {
    let app: Shokupan;
    let server: any; // Bun Server
    let port = 0;

    beforeAll(async () => {
        app = new Shokupan({
            enableHttpBridge: true
        });

        // Register controller
        app.mount("/", new WebSocketController());

        // Register HTTP route for bridge test
        app.get("/api/hello", (ctx) => ctx.json({ message: "Hello World" }));
        app.post("/api/echo-http", async (ctx) => ctx.json(await ctx.body()));

        server = await app.listen(0);
        port = server.port;
    });

    afterAll(async () => {
        await app.stop(true);
    });

    test("Event: ping -> pong", async () => {
        const url = `ws://localhost:${port}`;
        const socket = new WebSocket(url);

        await new Promise<void>((resolve, reject) => {
            socket.onopen = () => {
                socket.send(JSON.stringify({ type: "EVENT", event: "ping", data: {} }));
            };
            socket.onmessage = (event) => {
                const payload = JSON.parse(event.data.toString());
                expect(payload.event).toBe("pong");
                expect(payload.data).toBe("pong-data");
                resolve();
                socket.close();
            };
            socket.onerror = (e) => reject(e);
        });
    });

    test("Event: echo payload", async () => {
        const url = `ws://localhost:${port}`;
        const socket = new WebSocket(url);

        await new Promise<void>((resolve, reject) => {
            socket.onopen = () => {
                socket.send(JSON.stringify({ type: "EVENT", event: "echo", data: { text: "hello" } }));
            };
            socket.onmessage = (event) => {
                const payload = JSON.parse(event.data.toString());
                expect(payload.event).toBe("echo-reply");
                expect(payload.data).toEqual({ text: "hello" });
                resolve();
                socket.close();
            };
        });
    });

    test("HTTP Bridge: GET /api/hello", async () => {
        const url = `ws://localhost:${port}`;
        const socket = new WebSocket(url);

        await new Promise<void>((resolve, reject) => {
            socket.onopen = () => {
                socket.send(JSON.stringify({
                    type: "HTTP",
                    id: "req-1",
                    method: "GET",
                    path: "/api/hello",
                    headers: {},
                    body: null
                }));
            };
            socket.onmessage = (event) => {
                const payload = JSON.parse(event.data.toString());
                if (payload.type === 'RESPONSE' && payload.id === 'req-1') {
                    expect(payload.status).toBe(200);
                    expect(payload.body).toEqual({ message: "Hello World" });
                    resolve();
                    socket.close();
                }
            };
        });
    });

    test("HTTP Bridge: POST /api/echo-http", async () => {
        const url = `ws://localhost:${port}`;
        const socket = new WebSocket(url);

        await new Promise<void>((resolve, reject) => {
            socket.onopen = () => {
                socket.send(JSON.stringify({
                    type: "HTTP",
                    id: "req-2",
                    method: "POST",
                    path: "/api/echo-http",
                    headers: { "content-type": "application/json" },
                    body: { test: "data" }
                }));
            };
            socket.onmessage = (event) => {
                const payload = JSON.parse(event.data.toString());
                if (payload.type === 'RESPONSE' && payload.id === 'req-2') {
                    expect(payload.status).toBe(200);
                    expect(payload.body).toEqual({ test: "data" });
                    resolve();
                    socket.close();
                }
            };
        });
    });
});
