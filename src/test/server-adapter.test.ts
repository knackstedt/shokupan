import { describe, expect, it } from "bun:test";
import { createHttpServer } from "../plugins/server-adapter";
import { Shokupan } from "../shokupan";

describe("Server Adapters", () => {
    it("should support swapping the server engine to node:http", async () => {
        const app = new Shokupan({
            port: 0,
            serverFactory: createHttpServer()
        });

        app.get("/", ctx => ctx.text("Hello from Node HTTP"));

        const server = await app.listen();
        expect(server.port).toBeGreaterThan(0);

        const res = await fetch(`http://${server.hostname}:${server.port}/`);
        expect(await res.text()).toBe("Hello from Node HTTP");

        server.stop();
    });
});
