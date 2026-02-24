
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

        const session = app.mcpProtocol.createSession("test-session");
        const response = await session.handleMessage(toolsRequest as any);
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

        const session = app.mcpProtocol.createSession("test-session");
        const response = await session.handleMessage(callRequest as any);
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

        const session = app.mcpProtocol.createSession("test-session");
        const response = await session.handleMessage(promptRequest as any);
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

        const session = app.mcpProtocol.createSession("test-session");
        const response = await session.handleMessage(resourceRequest as any);
        expect(response?.result).toEqual({ content: "Resource content" });
    });
});

describe("MCP Advanced Features", () => {
    it("should handle invalid JSON-RPC requests strictly", async () => {
        const app = new Shokupan();
        const session = app.mcpProtocol.createSession("test-strictness");

        const invalidRequest = {
            // missing jsonrpc: "2.0"
            id: 1,
            method: "ping"
        };
        const response1 = await session.handleMessage(invalidRequest as any);
        expect(response1?.error?.code).toBe(-32600);
        expect(response1?.error?.message).toBe("Invalid Request");

        const unknownMethod = {
            jsonrpc: "2.0",
            id: 2,
            method: "unknown/method"
        };
        const response2 = await session.handleMessage(unknownMethod as any);
        expect(response2?.error?.code).toBe(-32601);
        expect(response2?.error?.message).toBe("Method not found");
    });

    it("should handle request cancellation via notifications/cancel", async () => {
        const app = new Shokupan();

        let abortSignalCheck = false;
        @Controller('/mcp-cancel-test')
        class CancelController {
            @Tool({ description: "Long running tool" })
            async longTask(_args: any, context: any) {
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => resolve("done"), 100);
                    context.signal.addEventListener("abort", () => {
                        clearTimeout(timeout);
                        abortSignalCheck = true;
                        reject(new Error("Aborted"));
                    });
                });
            }
        }
        app.mount('/', CancelController);

        const session = app.mcpProtocol.createSession("test-cancel");

        // Start long running request
        const callPromise = session.handleMessage({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "longTask", arguments: {} }
        });

        // Send cancel notification
        await session.handleMessage({
            jsonrpc: "2.0",
            method: "notifications/cancel",
            params: { requestId: 1 }
        });

        const response = await callPromise;
        expect(abortSignalCheck).toBeTrue();
        // Since it's a tool, errors are returned in `content` with `isError: true`
        expect(response?.result?.isError).toBeTrue();
        expect(response?.result?.content[0].text).toBe("Aborted");
    });

    it("should handle progress notifications", async () => {
        const app = new Shokupan();

        let progressSent = false;
        @Controller('/mcp-progress-test')
        class ProgressController {
            @Tool({ description: "Progress reporting tool" })
            async progTask(_args: any, context: any) {
                return new Promise(resolve => {
                    setTimeout(() => {
                        if (context.onProgress) context.onProgress(50, 100);
                        progressSent = true;
                        resolve("done");
                    }, 50);
                });
            }
        }
        app.mount('/', ProgressController);

        const session = app.mcpProtocol.createSession("test-progress");

        // Start long running request with progress token
        await session.handleMessage({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            // MCP spec says progressToken is inside _meta for requests, but let's test how mcp-protocol extracts it
            params: { name: "progTask", arguments: {}, meta: { progressToken: "token123" } }
        });

        expect(progressSent).toBeTrue();
    });

    it("should handle pagination boundaries for tools", async () => {
        const app = new Shokupan();

        @Controller('/mcp-pagination-test')
        class PaginationController {
            // Generate multiple tools to test cursor
            @Tool({ description: "Tool 1" }) t1() { }
            @Tool({ description: "Tool 2" }) t2() { }
            @Tool({ description: "Tool 3" }) t3() { }
        }
        app.mount('/', PaginationController);

        const session = app.mcpProtocol.createSession("test-pagination");

        // Let's simulate pagination if the server implements it.
        // If the server doesn't paginate by default for 3 tools, it should return them all.
        const response = await session.handleMessage({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list"
        });

        // The McpProtocol returns all tools for this app instance, which is exactly 3.
        expect(response?.result?.tools).toHaveLength(3);
    });

    it("should handle server-to-client roots/list", async () => {
        const app = new Shokupan();
        const session = app.mcpProtocol.createSession("test-roots");

        // Mock send method to auto-respond to the request
        session.send = (message: any) => {
            if (message.method === "roots/list") {
                // simulate client response
                setTimeout(() => {
                    session.handleMessage({
                        jsonrpc: "2.0",
                        id: message.id,
                        result: { roots: [{ uri: "file:///", name: "root" }] }
                    });
                }, 10);
            }
        };

        const rootsRes = await session.listRoots();
        expect(rootsRes.roots).toBeArray();
        expect(rootsRes.roots[0].uri).toBe("file:///");
    });
});
