
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AsyncApiPlugin } from "../plugins/application/asyncapi/plugin";
import { ShokupanRouter } from "../router";
import { Shokupan } from "../shokupan";

describe("AsyncAPI Reproduction Edge Cases", () => {
    let app: Shokupan;
    let server: any;

    beforeAll(async () => {
        const router1 = new ShokupanRouter();
        const router2 = new ShokupanRouter();

        router1.event("event.no_desc", (ctx) => {
            console.log("Handled event.no_desc");
        });

        router1.event("event.no_payload", (ctx) => {
            console.log("Handled event.no_payload");
        });

        router1.get("/emit1", (ctx) => {
            ctx.emit("event.multi_emit", { source: "route1" });
            return ctx.text("Emitted 1");
        });

        router2.get("/emit2", (ctx) => {
            ctx.emit("event.multi_emit", { source: "route2" });
            return ctx.text("Emitted 2");
        });

        app = new Shokupan({
            enableAsyncApiGen: true,
            blockOnAsyncApiGen: true,
            enableAsyncAstScanning: false,
            enableHTTPBridge: true
        });

        app.mount("/r1", router1);
        app.mount("/r2", router2);
        app.register(new AsyncApiPlugin());

        server = await app.listen(0);
    });

    afterAll(async () => {
        await app.stop(true);
    });

    test("Event with no description is present in spec", () => {
        const spec = app.asyncApiSpec;
        expect(spec.channels["event.no_desc"]).toBeDefined();
    });

    test("Event with no payload is present in spec", () => {
        const spec = app.asyncApiSpec;
        expect(spec.channels["event.no_payload"]).toBeDefined();
    });

    test("Event emitted from multiple routes appears once in spec", () => {
        const spec = app.asyncApiSpec;
        expect(spec.channels["event.multi_emit"]).toBeDefined();
    });
});
