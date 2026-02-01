
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ShokupanContext } from "../../../context";
import { Event, Spec, WebsocketController } from '../../../decorators';
import { Shokupan } from "../../../shokupan";
import { AsyncApiPlugin } from "../asyncapi/plugin";

@WebsocketController("/")
class TestController {
    @Event("ping")
    @Spec({
        summary: "Ping event",
        description: "Sends a pong response",
        message: {
            payload: {
                type: "object",
                properties: {
                    message: { type: "string" }
                }
            }
        }
    })
    async onPing(ctx: ShokupanContext) {
        ctx.emit("pong", { message: "pong" });
    }

    @Event("complex")
    async onComplex(ctx: ShokupanContext) {
        // No spec, but emits multiple things
        ctx.emit("status", { status: "processing" });
        await new Promise(r => setTimeout(r, 10));
        ctx.emit("done", { results: [1, 2, 3] });
    }
}

describe("AsyncAPI Generator & Plugin", () => {
    let app: Shokupan;
    let server: any;
    let port = 0;


    beforeAll(async () => {
        app = new Shokupan({
            enableAsyncApiGen: true,
            blockOnAsyncApiGen: true, // Wait for AST analysis in tests
            enableAsyncAstScanning: false, // Use sync analyzer for reliable tests
            enableHttpBridge: true
        });

        app.mount("/", new TestController());
        app.register(new AsyncApiPlugin()); // Default path /asyncapi

        server = await app.listen(0);
        port = server.port;
    });

    afterAll(async () => {
        await app.stop(true);
    });

    test("Generates AsyncAPI Spec", async () => {
        // Wait for generation to complete (it happens in listen())
        expect(app.asyncApiSpec).toBeDefined();
        const spec = app.asyncApiSpec;

        expect(spec.asyncapi).toBe("3.0.0");
        expect(spec.channels).toBeDefined();

        // Check ping event
        expect(spec.channels["ping"]).toBeDefined();
        expect(spec.channels["ping"].publish).toBeDefined();
        expect(spec.channels["ping"].publish.summary).toBe("Ping event");
        expect(spec.channels["ping"].publish.message.payload.properties.message.type).toBe("string");

        // Check emitted events (detected via static analysis)
        expect(spec.channels["pong"]).toBeDefined();
        expect(spec.channels["pong"].subscribe).toBeDefined();

        // Check complex event
        expect(spec.channels["complex"]).toBeDefined();
        expect(spec.channels["complex"].publish).toBeDefined();

        // Check complex emitted events
        expect(spec.channels["status"]).toBeDefined();
        expect(spec.channels["done"]).toBeDefined();
    });

    test("Plugin serves HTML Playground", async () => {
        const res = await fetch(`http://localhost:${port}/asyncapi`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain("Shokupan AsyncAPI");
        expect(text).toContain("WS");
        expect(text).toContain("Socket.IO");
    });

    test("Plugin serves JSON Spec", async () => {
        const res = await fetch(`http://localhost:${port}/asyncapi/json`);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.asyncapi).toBe("3.0.0");
        expect(json.channels["ping"]).toBeDefined();
    });
});
