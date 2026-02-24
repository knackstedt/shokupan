
import { afterAll, describe, expect, it } from "bun:test";
import { Controller, Get } from "../../../decorators/http";
import { Shokupan } from "../../../shokupan";
import { MCPServerPlugin } from "../mcp-server/plugin";

@Controller('/test')
class TestController {
    @Get('/hello')
    hello() {
        return "world";
    }
}

describe("MCP Server Plugin", async () => {
    let server: any;
    const app = new Shokupan();
    // Pass src as rootDir to avoid scanning everything
    app.register(new MCPServerPlugin({ path: 'mcp', rootDir: './src' }));

    app.mount('/', TestController);

    server = await app.listen(0);
    const port = server.port;

    it("should list endpoints via list_endpoints tool", async () => {
        const aborter = new AbortController();
        // Connect to SSE (still required for initialization/session)
        const sseRes = await fetch(`http://localhost:${port}/mcp`, {
            headers: { "Accept": "application/json, text/event-stream" },
            signal: aborter.signal
        });
        expect(sseRes.status).toBe(200);

        // Extract the sessionId from the SSE stream
        let sessionId = "";
        const reader = sseRes.body?.getReader();
        if (reader) {
            const { value } = await reader.read();
            if (value) {
                const text = new TextDecoder().decode(value);
                const match = text.match(/sessionId=([^\s]+)/);
                if (match) {
                    sessionId = match[1];
                }
            }
        }

        // Send a tool call
        const toolCall = {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
                name: "list_endpoints",
                arguments: {}
            }
        };

        const postRes = await fetch(`http://localhost:${port}/mcp/message?sessionId=${sessionId}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream"
            },
            body: JSON.stringify(toolCall)
        });

        if (postRes.status !== 200) {
            console.error("POST Error:", await postRes.text());
        }
        expect(postRes.status).toBe(200);

        const data = await postRes.json();

        expect(data.id).toBe(1);

        expect(data.result).toBeDefined();
        const contentText = data.result.content[0].text;
        const content = JSON.parse(contentText);
        expect(content).toBeArray();

        aborter.abort();
    }, 15000);

    afterAll(() => {
        if (server) server.stop();
    });
});
