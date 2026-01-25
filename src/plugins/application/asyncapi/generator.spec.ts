
import { describe, expect, it } from "bun:test";
import { ShokupanRouter } from "../../../router";
import { generateAsyncApi } from "./generator";

describe("AsyncAPI Generator", () => {
    it("should generate basic AsyncAPI spec", async () => {
        const router = new ShokupanRouter();
        const spec = await generateAsyncApi(router, { info: { title: "Test", version: "1.0.0" } });

        expect(spec.asyncapi).toBe("3.0.0");
        expect(spec.info.title).toBe("Test");
        expect(spec.channels).toBeDefined();
    });

    it("should extract event handlers from router", async () => {
        const router = new ShokupanRouter();
        // Mock event handler storage if we can, or use public API
        // router.on('test-event', ...)
        const handler = () => { };
        router.event('test-event', handler);

        const spec = await generateAsyncApi(router);
        // Should have channel for 'test-event'
        expect(spec.channels['test-event']).toBeDefined();
        // It's a publish operation (Client emits to Server, so Server 'subscribes' to handle it? 
        // AsyncAPI perspective: Application (Server) perspective?
        // Usually:
        // 'publish' means we can publish to this channel (so server receives it)
        // 'subscribe' means we can subscribe to this channel (so server emits it)
        // Shokupan .on() handles incoming. Client publishes. So Channel should have 'publish' op? 
        // Code says: channels[eventName] = { publish: ... } 
        // So yes.
        expect(spec.channels['test-event'].publish).toBeDefined();
    });
});
