import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AsyncApiPlugin } from "../../plugins/application/asyncapi/plugin";
import { Shokupan } from "../../shokupan";
import { ReproController } from "../fixtures/asyncapi-repro-controller";

describe("AsyncAPI Payload Introspection", () => {
    let app: Shokupan;
    let server: any;

    beforeAll(async () => {
        app = new Shokupan({
            enableAsyncApiGen: true,
            blockOnAsyncApiGen: true, // Wait for AST analysis in tests
            enableAsyncAstScanning: false, // Use sync analyzer for reliable tests
            enableHttpBridge: true
        });

        app.mount("/", new ReproController());
        app.register(new AsyncApiPlugin());

        server = await app.listen(0);
    });

    afterAll(async () => {
        await app.stop(true);
    });

    test("Detects payload schema for object literal", async () => {
        const spec = app.asyncApiSpec;
        const channel = spec.channels["pong"];
        expect(channel).toBeDefined();

        const message = channel.subscribe.message;

        // This confirms AST analysis picked up the payload structure
        expect(message.payload).toBeDefined();
        expect(message.payload.properties).toBeDefined();
        expect(message.payload.properties.message).toBeDefined();
        expect(message.payload.properties.message.type).toBe("string");
    });

    test("Detects payload schema for variable", async () => {
        const spec = app.asyncApiSpec;
        const channel = spec.channels["status"];
        expect(channel).toBeDefined();

        const message = channel.subscribe.message;

        // This confirms variable reference introspection worked
        expect(message.payload).toBeDefined();
        expect(message.payload.properties).toBeDefined();
        expect(message.payload.properties.id.type).toBe("number");
        expect(message.payload.properties.status.type).toBe("string");
    });
});
