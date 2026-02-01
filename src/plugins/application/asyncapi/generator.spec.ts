
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

});
