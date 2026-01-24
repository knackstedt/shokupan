
export interface JsonRpcRequest {
    jsonrpc: "2.0";
    id?: string | number | null;
    method: string;
    params?: any;
}

export interface JsonRpcResponse {
    jsonrpc: "2.0";
    id: string | number | null;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

export interface McpTool {
    name: string;
    description?: string;
    inputSchema?: any;
    handler: (args: any) => Promise<any> | any;
}

export interface McpPrompt {
    name: string;
    description?: string;
    arguments?: {
        name: string;
        description?: string;
        required?: boolean;
    }[];
    handler: (args: any) => Promise<any> | any;
}

export interface McpResource {
    uri: string; // glob pattern or direct uri
    name?: string;
    description?: string;
    mimeType?: string;
    handler: (uri: string, args?: any) => Promise<any> | any;
}

export class McpProtocol {
    private tools = new Map<string, McpTool>();
    private prompts = new Map<string, McpPrompt>();
    private resources = new Map<string, McpResource>();

    constructor(
        tools: McpTool[] = [],
        prompts: McpPrompt[] = [],
        resources: McpResource[] = []
    ) {
        tools.forEach(t => this.tools.set(t.name, t));
        prompts.forEach(p => this.prompts.set(p.name, p));
        resources.forEach(r => this.resources.set(r.uri, r));
    }

    public addTool(tool: McpTool) {
        this.tools.set(tool.name, tool);
    }

    public addPrompt(prompt: McpPrompt) {
        this.prompts.set(prompt.name, prompt);
    }

    public addResource(resource: McpResource) {
        this.resources.set(resource.uri, resource);
    }

    public merge(other: McpProtocol) {
        other.tools.forEach(t => this.tools.set(t.name, t));
        other.prompts.forEach(p => this.prompts.set(p.name, p));
        other.resources.forEach(r => this.resources.set(r.uri, r));
    }

    public async handleMessage(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
        if (message.jsonrpc !== "2.0") {
            return this.error(message.id, -32600, "Invalid Request");
        }

        try {
            switch (message.method) {
                case "initialize":
                    return this.success(message.id, {
                        protocolVersion: "2024-11-05",
                        serverInfo: {
                            name: "Shokupan MCP",
                            version: "1.0.0"
                        },
                        capabilities: {
                            tools: this.tools.size > 0 ? {} : undefined,
                            prompts: this.prompts.size > 0 ? {} : undefined,
                            resources: this.resources.size > 0 ? {} : undefined,
                        }
                    });

                case "ping":
                    return this.success(message.id, {});

                case "tools/list":
                    if (this.tools.size === 0) return this.success(message.id, { tools: [] });
                    return this.success(message.id, {
                        tools: Array.from(this.tools.values()).map(t => ({
                            name: t.name,
                            description: t.description,
                            inputSchema: t.inputSchema || { type: "object", properties: {} }
                        }))
                    });

                case "tools/call": {
                    if (!message.params || !message.params.name) {
                        return this.error(message.id, -32602, "Invalid params: name required");
                    }
                    const tool = this.tools.get(message.params.name);
                    if (!tool) {
                        return this.error(message.id, -32601, `Tool not found: ${message.params.name}`);
                    }
                    try {
                        const result = await tool.handler(message.params.arguments || {});
                        return this.success(message.id, result);
                    } catch (e: any) {
                        return {
                            jsonrpc: "2.0",
                            id: message.id ?? null,
                            result: {
                                isError: true,
                                content: [{ type: "text", text: e.message || String(e) }]
                            }
                        };
                    }
                }

                case "prompts/list":
                    if (this.prompts.size === 0) return this.success(message.id, { prompts: [] });
                    return this.success(message.id, {
                        prompts: Array.from(this.prompts.values()).map(p => ({
                            name: p.name,
                            description: p.description,
                            arguments: p.arguments
                        }))
                    });

                case "prompts/get": {
                    if (!message.params || !message.params.name) {
                        return this.error(message.id, -32602, "Invalid params: name required");
                    }
                    const prompt = this.prompts.get(message.params.name);
                    if (!prompt) {
                        return this.error(message.id, -32601, `Prompt not found: ${message.params.name}`);
                    }
                    const result = await prompt.handler(message.params.arguments || {});
                    return this.success(message.id, result);
                }

                case "resources/list":
                    if (this.resources.size === 0) return this.success(message.id, { resources: [] });
                    return this.success(message.id, {
                        resources: Array.from(this.resources.values()).map(r => ({
                            uri: r.uri,
                            name: r.name,
                            description: r.description,
                            mimeType: r.mimeType
                        }))
                    });

                case "resources/read": {
                    if (!message.params || !message.params.uri) {
                        return this.error(message.id, -32602, "Invalid params: uri required");
                    }
                    // For now, exact match or simple check. Glob matching would require explicit support.
                    // Assuming simplified implementation where we iterate and find handler.
                    let resource = this.resources.get(message.params.uri);

                    // Fallback to finding a matching handler if glob (simplified)
                    // In a real implementation we might want a better router for resources
                    // But here we rely on the registration.

                    if (!resource) {
                        return this.error(message.id, -32601, `Resource not found: ${message.params.uri}`);
                    }

                    const result = await resource.handler(message.params.uri);
                    return this.success(message.id, result);
                }

                default:
                    // Notifications (no id) should just return null
                    if (message.id === undefined) return null;
                    return this.error(message.id, -32601, "Method not found");
            }
        } catch (err: any) {
            return this.error(message.id, -32603, "Internal Error", err.message);
        }
    }

    private success(id: string | number | undefined | null, result: any): JsonRpcResponse {
        return {
            jsonrpc: "2.0",
            id: id ?? null,
            result
        };
    }

    private error(id: string | number | undefined | null, code: number, message: string, data?: any): JsonRpcResponse {
        return {
            jsonrpc: "2.0",
            id: id ?? null,
            error: { code, message, data }
        };
    }
}
