
import { describe, expect, it } from "bun:test";
import { Controller } from "../decorators/http";
import { Prompt, Resource, Tool } from "../decorators/mcp";
import { Shokupan } from "../shokupan";

@Controller('/mcp-test')
class McpController {
    @Tool({ description: "A simple calculator tool" })
    add({ a, b }: { a: number, b: number; }) {
        return a + b;
    }

    @Prompt({ name: "greet", description: "Greets a user" })
    greet({ name }: { name: string; }) {
        return `Hello, ${name}!`;
    }

    @Resource("test://resource")
    getResource(uri: string) {
        return { content: "Resource content" };
    }
}

describe("MCP Core Integration", () => {
    it("should register tools via decorators", async () => {
        const app = new Shokupan();
        app.mount('/', McpController);

        // Access the Protocol instance from the router (app is a router)
        // Note: ControllerScanner attaches to the router where it is mounted.
        // app.mount mounts the controller to the app router.

        // Wait, app.mount uses ControllerScanner which calls router.tool for the router it is scanning into.
        // So app.mcpProtocol should have the tools.

        // However, ControllerScanner logic:
        // router.tool(...)

        // Let's verify
        // Access private map via any cast or if we exposed getter (we didn't yet, but we can check handleMessage or private property)

        const toolsRequest = {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list"
        };

        const response = await app.mcpProtocol.handleMessage(toolsRequest as any);
        expect(response).toBeDefined();
        expect(response?.result.tools).toBeArray();
        expect(response?.result.tools).toHaveLength(1);
        expect(response?.result.tools[0].name).toBe("add");
    });

    it("should execute tools", async () => {
        const app = new Shokupan();
        app.mount('/', McpController);

        const callRequest = {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
                name: "add",
                arguments: { a: 5, b: 3 }
            }
        };

        const response = await app.mcpProtocol.handleMessage(callRequest as any);
        expect(response).toBeDefined();
        expect(response?.result).toBe(8);
    });

    it("should register and execute prompts", async () => {
        const app = new Shokupan();
        app.mount('/', McpController);

        const promptRequest = {
            jsonrpc: "2.0",
            id: 3,
            method: "prompts/get",
            params: {
                name: "greet",
                arguments: { name: "Shokupan" }
            }
        };

        const response = await app.mcpProtocol.handleMessage(promptRequest as any);
        expect(response?.result).toBe("Hello, Shokupan!");
    });

    it("should register and read resources", async () => {
        const app = new Shokupan();
        app.mount('/', McpController);

        const resourceRequest = {
            jsonrpc: "2.0",
            id: 4,
            method: "resources/read",
            params: {
                uri: "test://resource"
            }
        };

        const response = await app.mcpProtocol.handleMessage(resourceRequest as any);
        expect(response?.result).toEqual({ content: "Resource content" });
    });
});
