export interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: any;
}

export interface JsonRpcNotification {
    jsonrpc: "2.0";
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

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export interface McpContext {
    session: McpSession;
    signal: AbortSignal;
    onProgress?: (progress: number, total?: number) => void;
}

export interface McpTool {
    name: string;
    description?: string;
    inputSchema?: any;
    handler: (args: any, context: McpContext) => Promise<any> | any;
}

export interface McpPrompt {
    name: string;
    description?: string;
    arguments?: {
        name: string;
        description?: string;
        required?: boolean;
    }[];
    handler: (args: any, context: McpContext) => Promise<any> | any;
}

export interface McpResource {
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
    handler: (uri: string, context: McpContext) => Promise<any> | any;
}

export class McpSession {
    public readonly sessionId: string;
    public initialized: boolean = false;
    private writeController?: ReadableStreamDefaultController;
    private activeRequests = new Map<string | number, AbortController>();
    private pendingCallbacks = new Map<string | number, { resolve: (val: any) => void; reject: (err: any) => void; }>();
    private nextMessageId = 1;

    constructor(
        sessionId: string,
        private readonly protocol: McpProtocol
    ) {
        this.sessionId = sessionId;
    }

    public attachStream(controller: ReadableStreamDefaultController) {
        this.writeController = controller;
    }

    public close() {
        if (this.writeController) {
            try {
                this.writeController.close();
            } catch (e) {
                // Ignore if already closed
            }
        }
        this.activeRequests.forEach(controller => {
            controller.abort(new Error("Session closed"));
        });
        this.activeRequests.clear();

        this.pendingCallbacks.forEach(({ reject }) => {
            reject(new Error("Session closed"));
        });
        this.pendingCallbacks.clear();
        this.initialized = false;
    }

    public send(message: JsonRpcMessage) {
        if (!this.writeController) return;
        try {
            this.writeController.enqueue(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
        } catch (e) {
            this.close();
        }
    }

    public async sendRequest(method: string, params?: any): Promise<any> {
        const id = this.nextMessageId++;
        return new Promise((resolve, reject) => {
            this.pendingCallbacks.set(id, { resolve, reject });
            this.send({ jsonrpc: "2.0", id, method, params });
        });
    }

    public sendNotification(method: string, params?: any) {
        this.send({ jsonrpc: "2.0", method, params });
    }

    /**
     * Request the current roots from the client.
     */
    public async listRoots(): Promise<{ roots: { uri: string; name?: string; }[]; }> {
        return this.sendRequest("roots/list");
    }

    /**
     * Request the client to sample an LLM completion.
     */
    public async createMessageSampling(params: {
        messages: { role: "user" | "assistant"; content: any; }[];
        maxTokens?: number;
        systemPrompt?: string;
        stopSequences?: string[];
        temperature?: number;
    }): Promise<{
        role: "user" | "assistant";
        content: any;
        model: string;
        stopReason?: string;
    }> {
        return this.sendRequest("sampling/createMessage", params);
    }

    public async handleMessage(message: any): Promise<JsonRpcResponse | null> {
        if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
            return this.error(message?.id ?? null, -32600, "Invalid Request");
        }

        // Handle JSON-RPC Response (results of our server-to-client requests)
        if ("result" in message || "error" in message) {
            const cb = this.pendingCallbacks.get(message.id as string | number);
            if (cb) {
                this.pendingCallbacks.delete(message.id as string | number);
                if (message.error) {
                    cb.reject(new Error(message.error.message));
                } else {
                    cb.resolve(message.result);
                }
            }
            return null; // Don't respond to responses
        }

        const req = message as JsonRpcRequest | JsonRpcNotification;
        const isNotification = !("id" in req);

        if (isNotification) {
            // Handle notifications
            if (req.method === "notifications/cancel") {
                const requestId = req.params?.requestId;
                if (requestId) {
                    const controller = this.activeRequests.get(requestId);
                    if (controller) {
                        controller.abort(new Error("Cancelled by client"));
                        this.activeRequests.delete(requestId);
                    }
                }
            } else if (req.method === "notifications/initialized") {
                this.initialized = true;
            } else if (req.method === "notifications/progress") {
                // Ignore for now unless we are expecting it via a pending callback mechanism
            }
            return null;
        }

        // Handle JSON-RPC Request
        try {
            const controller = new AbortController();
            this.activeRequests.set(req.id, controller);

            // Context for handlers
            const context: McpContext = {
                session: this,
                signal: controller.signal,
                onProgress: (progress, total) => {
                    const progressToken = req.params?.meta?.progressToken;
                    if (progressToken) {
                        this.sendNotification("notifications/progress", {
                            progressToken,
                            progress,
                            total
                        });
                    }
                }
            };

            let result: any;
            switch (req.method) {
                case "initialize":
                    result = {
                        protocolVersion: "2024-11-05",
                        serverInfo: {
                            name: "Shokupan MCP",
                            version: "1.0.0"
                        },
                        capabilities: {
                            tools: this.protocol.hasTools() ? {} : undefined,
                            prompts: this.protocol.hasPrompts() ? {} : undefined,
                            resources: this.protocol.hasResources() ? {} : undefined,
                        }
                    };
                    break;
                case "ping":
                    result = {};
                    break;
                case "tools/list":
                    result = this.protocol.listTools(req.params?.cursor);
                    break;
                case "tools/call":
                    if (!req.params || !req.params.name) throw new Error("Invalid params: name required");
                    result = await this.protocol.callTool(req.params.name, req.params.arguments, context);
                    break;
                case "prompts/list":
                    result = this.protocol.listPrompts(req.params?.cursor);
                    break;
                case "prompts/get":
                    if (!req.params || !req.params.name) throw new Error("Invalid params: name required");
                    result = await this.protocol.getPrompt(req.params.name, req.params.arguments, context);
                    break;
                case "resources/list":
                    result = this.protocol.listResources(req.params?.cursor);
                    break;
                case "resources/read":
                    if (!req.params || !req.params.uri) throw new Error("Invalid params: uri required");
                    result = await this.protocol.readResource(req.params.uri, context);
                    break;
                default:
                    return this.error(req.id, -32601, "Method not found");
            }

            this.activeRequests.delete(req.id);
            return this.success(req.id, result);
        } catch (err: any) {
            this.activeRequests.delete(req.id);

            // For tool execution errors specifically, return success with isError
            if (req.method === "tools/call") {
                return this.success(req.id, {
                    isError: true,
                    content: [{ type: "text", text: err.message || String(err) }]
                });
            }

            // General protocol errors
            return this.error(req.id, -32603, "Internal Error", err.message);
        }
    }

    private success(id: string | number, result: any): JsonRpcResponse {
        return {
            jsonrpc: "2.0",
            id,
            result
        };
    }

    private error(id: string | number | null, code: number, message: string, data?: any): JsonRpcResponse {
        return {
            jsonrpc: "2.0",
            id,
            error: { code, message, data }
        };
    }
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

    public hasTools() { return this.tools.size > 0; }
    public hasPrompts() { return this.prompts.size > 0; }
    public hasResources() { return this.resources.size > 0; }

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

    public createSession(sessionId: string): McpSession {
        return new McpSession(sessionId, this);
    }

    public listTools(cursor?: string) {
        // Simple pagination: ignore cursor for now until items exceed limits.
        return {
            tools: Array.from(this.tools.values()).map(t => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema || { type: "object", properties: {} }
            }))
        };
    }

    public async callTool(name: string, args: any, context: McpContext) {
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`Tool not found: ${name}`);
        return await tool.handler(args || {}, context);
    }

    public listPrompts(cursor?: string) {
        return {
            prompts: Array.from(this.prompts.values()).map(p => ({
                name: p.name,
                description: p.description,
                arguments: p.arguments
            }))
        };
    }

    public async getPrompt(name: string, args: any, context: McpContext) {
        const prompt = this.prompts.get(name);
        if (!prompt) throw new Error(`Prompt not found: ${name}`);
        return await prompt.handler(args || {}, context);
    }

    public listResources(cursor?: string) {
        return {
            resources: Array.from(this.resources.values()).map(r => ({
                uri: r.uri,
                name: r.name,
                description: r.description,
                mimeType: r.mimeType
            }))
        };
    }

    public async readResource(uri: string, context: McpContext) {
        const resource = this.resources.get(uri);
        if (!resource) throw new Error(`Resource not found: ${uri}`);
        return await resource.handler(uri, context);
    }
}
