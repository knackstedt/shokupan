
import { describe, expect, it, mock } from "bun:test";
import { attachSocketIOBridge } from "./socket-io";

describe("Socket.IO Bridge", () => {
    it("should attach listeners to io instance", () => {
        const io = {
            on: mock(),
        };
        const app = {
            applicationConfig: {}
        };

        attachSocketIOBridge(io as any, app as any);

        expect(io.on).toHaveBeenCalledWith("connection", expect.any(Function));
    });
});
