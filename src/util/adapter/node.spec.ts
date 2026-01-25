
import { describe, expect, it, mock } from "bun:test";
import { Shokupan } from "../../shokupan";
import { NodeAdapter } from "./node";

describe("Node Adapter", () => {
    it("should initialize", () => {
        const adapter = new NodeAdapter();
        expect(adapter).toBeDefined();
    });

    it("should create server", async () => {
        const adapter = new NodeAdapter();
        const app = {
            applicationConfig: { hostname: 'localhost' },
            handle: mock()
        } as unknown as Shokupan;

        const server = await adapter.listen(0, app); // 0 for random port
        expect(server).toBeDefined();
        await adapter.stop();
    });
});
