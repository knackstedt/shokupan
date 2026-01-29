import { describe, expect, it } from "bun:test";
import { Shokupan } from "./shokupan";

describe("Response Transformer Integration", () => {
    it("should use explicit ctx.respond() with default transformer (JSON)", async () => {
        const app = new Shokupan();

        app.get("/respond", (ctx) => {
            return ctx.respond({ message: "hello" });
        });

        const res = await app.testRequest({
            path: "/respond",
            method: "GET"
        });

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toBe("application/json");
        expect(res.data).toEqual({ message: "hello" });
    });

    it("should negotiate content type based on Accept header", async () => {
        const app = new Shokupan();

        // Register a text/xml transformer
        app.registerResponseTransformer({
            contentType: "application/xml",
            serialize: (data: any) => ({
                body: `<message>${data.message}</message>`,
                headers: { "content-type": "application/xml" }
            })
        });

        app.get("/respond", (ctx) => {
            return ctx.respond({ message: "hello" });
        });

        // Test JSON preference
        const resJson = await app.testRequest({
            path: "/respond",
            method: "GET",
            headers: { "accept": "application/json" }
        });
        expect(resJson.headers["content-type"]).toBe("application/json");
        expect(resJson.data).toEqual({ message: "hello" });

        // Test XML preference
        const resXml = await app.testRequest({
            path: "/respond",
            method: "GET",
            headers: { "accept": "application/xml" }
        });
        expect(resXml.headers["content-type"]).toBe("application/xml");
        expect(resXml.data).toBe("<message>hello</message>");
    });

    it("should respect quality values in Accept header", async () => {
        const app = new Shokupan();

        app.registerResponseTransformer({
            contentType: "application/xml",
            serialize: (data: any) => ({
                body: `<xml>${data.message}</xml>`,
                headers: { "content-type": "application/xml" }
            })
        });

        app.get("/respond", (ctx) => ctx.respond({ message: "test" }));

        // XML q=0.9, JSON q=0.8 -> Should get XML
        const res = await app.testRequest({
            path: "/respond",
            method: "GET",
            headers: { "accept": "application/json;q=0.8, application/xml;q=0.9" }
        });
        expect(res.headers["content-type"]).toBe("application/xml");
        expect(res.data).toBe("<xml>test</xml>");
    });

    it("should use wildcard matching", async () => {
        const app = new Shokupan();
        // Default transformers (JSON, text) are registered by default

        app.get("/respond", (ctx) => ctx.respond({ message: "test" }));

        // application/* should match application/json
        const res = await app.testRequest({
            path: "/respond",
            method: "GET",
            headers: { "accept": "application/*" }
        });
        expect(res.headers["content-type"]).toBe("application/json");
    });

    it("should fallback to json() if no transformer matches and no default relevant", async () => {
        // By default defaultResponseTransformer is set to application/json in config defaults we added.
        // Let's unset it for this test to verify fallback logic in respond()
        const app = new Shokupan({
            defaultResponseTransformer: undefined
        });

        app.get("/respond", (ctx) => ctx.respond({ message: "fallback" }));

        const res = await app.testRequest({
            path: "/respond",
            method: "GET",
            headers: { "accept": "image/png" } // Nothing matches this
        });

        // Should fallback to JSON because ctx.respond calls ctx.json if no transformer found
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toBe("application/json");
        expect(res.data).toEqual({ message: "fallback" });
    });

    describe("Automatic Content Negotiation (ctx.json)", () => {
        it("should not perform negotiation by default (backward compatibility)", async () => {
            const app = new Shokupan(); // enableAutoContentNegotiation defaults to false

            app.registerResponseTransformer({
                contentType: "application/xml",
                serialize: () => ({ body: "<xml/>", headers: { "content-type": "application/xml" } })
            });

            app.get("/json", (ctx) => ctx.json({ message: "hello" }));

            // Even if we ask for XML, we should get JSON because auto-negotiation is off
            const res = await app.testRequest({
                path: "/json",
                method: "GET",
                headers: { "accept": "application/xml" }
            });

            expect(res.headers["content-type"]).toBe("application/json");
        });

        it("should perform negotiation when enabled", async () => {
            const app = new Shokupan({
                enableAutoContentNegotiation: true
            });

            app.registerResponseTransformer({
                contentType: "application/xml",
                serialize: (data: any) => ({
                    body: `<xml>${data.message}</xml>`,
                    headers: { "content-type": "application/xml" }
                })
            });

            // Handler uses ctx.json()
            app.get("/json", (ctx) => ctx.json({ message: "auto" }));

            // Request XML
            const res = await app.testRequest({
                path: "/json",
                method: "GET",
                headers: { "accept": "application/xml" }
            });

            expect(res.headers["content-type"]).toBe("application/xml");
            expect(res.data).toBe("<xml>auto</xml>");
        });
    });

    describe("Helpers", () => {
        it("should allow setting default response type", async () => {
            const app = new Shokupan();

            app.registerResponseTransformer({
                contentType: "text/custom",
                serialize: (data) => ({
                    body: "custom:" + JSON.stringify(data),
                    headers: { "content-type": "text/custom" }
                })
            });

            app.setDefaultResponseType("text/custom");

            app.get("/default", (ctx) => ctx.respond({ a: 1 }));

            // No Accept header -> Use default
            const res = await app.testRequest({ path: "/default", method: "GET" });
            expect(res.headers["content-type"]).toBe("text/custom");
            expect(res.data).toBe('custom:{"a":1}');
        });
    });
});
