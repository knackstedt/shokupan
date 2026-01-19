
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { ShokupanContext } from '../../../context';
import { ShokupanRouter } from "../../../router";
import type { Shokupan } from '../../../shokupan';
import { $appRoot } from "../../../util/symbol";
import type { ShokupanPlugin } from "../../../util/types";
import { OpenAPIAnalyzer } from "../openapi/analyzer.impl";

export interface MCPServerPluginOptions {
    /**
     * The path to mount the MCP server to.
     */
    path?: string;
    /**
     * The root directory to scan for OpenAPI documents.
     */
    rootDir?: string;
    /**
     * Whether to allow the introspection tool.
     */
    allowIntrospection?: boolean;
    /**
     * Whether to allow tool execution.
     */
    allowToolExecution?: boolean;
}

/**
 * Attaches an MCP server to the application. 
 * This MCP server is focus-designed to provide introspection and tool execution capabilities.
 * 
 * If your application design requires anything custom, implement your own MCP server.
 */
export class MCPServerPlugin implements ShokupanPlugin {
    private router = new ShokupanRouter();
    private mcpServer: McpServer;
    private transport: WebStandardStreamableHTTPServerTransport;
    private analyzer: OpenAPIAnalyzer;

    constructor(private options: MCPServerPluginOptions = {}) {
        options.allowIntrospection ??= true;
        options.allowToolExecution ??= true;
        options.path ??= '/mcp';
        if (!options.path.startsWith('/')) {
            options.path = '/' + options.path;
        }
        options.rootDir ??= process.cwd();

        this.mcpServer = new McpServer({
            name: "Shokupan MCP Server",
            version: "1.0.0"
        });
        this.transport = new WebStandardStreamableHTTPServerTransport({
            enableJsonResponse: true
        });
    }

    public async onInit(app: Shokupan) {
        this[$appRoot] = app;

        // Initialize Analyzer
        this.analyzer = new OpenAPIAnalyzer(this.options.rootDir);

        // Register Tools
        if (this.options.allowIntrospection) {
            this.registerTools();
            this.registerResources();
            this.registerPrompts();
        }

        // Connect server to transport
        await this.mcpServer.connect(this.transport);

        // Mount the router
        app.mount(this.options.path, this.router);

        // Define Routes
        this.setupRoutes();

        // Metadata
        this.router.metadata = {
            file: import.meta.file,
            line: 1,
            name: 'MCPServerPlugin',
            pluginName: 'MCP Server'
        };
    }

    private setupRoutes() {
        // Handle all requests to the mount path (e.g., /mcp)
        const handler = async (ctx: ShokupanContext) => {
            let parsedBody;
            if (ctx.method === 'POST') {
                try {
                    parsedBody = await ctx.body();
                } catch (e) {
                    return new Response(JSON.stringify({
                        jsonrpc: "2.0",
                        id: null,
                        error: {
                            code: -32700,
                            message: "Parse error"
                        }
                    }), {
                        status: 400,
                        headers: { "Content-Type": "application/json" }
                    });
                }
            }

            const req = new Request(ctx.url.toString(), {
                method: ctx.method,
                headers: ctx.headers,
                body: null
            });

            try {
                return await this.transport.handleRequest(req, { parsedBody });
            } catch (e) {
                return new Response(e.message || String(e), { status: 500 });
            }
        };

        // Register for single route to avoid duplicate handling
        this.router.get('', handler);
        this.router.post('', handler);
    }

    private registerTools() {
        const ensureExecutionAllowed = () => {
            if (!this.options.allowToolExecution) {
                throw new Error("Tool execution is disabled.");
            }
        };

        this.mcpServer.registerTool(
            "list_endpoints",
            {
                description: "List all detected endpoints in the application",
                inputSchema: {}
            },
            async () => {
                ensureExecutionAllowed();
                const { applications } = await this.analyzer.analyze();
                const endpoints = applications.flatMap(app =>
                    app.routes.map(r => ({
                        method: r.method,
                        path: r.path,
                        handler: r.handlerName,
                        summary: r.summary
                    }))
                );

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(endpoints, null, 2)
                    }]
                };
            }
        );

        this.mcpServer.registerTool(
            "get_endpoint_details",
            {
                description: "Get detailed schema and side-effects for a specific endpoint",
                inputSchema: {
                    method: z.string(),
                    path: z.string()
                }
            },
            async ({ method, path }) => {
                ensureExecutionAllowed();
                const { applications } = await this.analyzer.analyze();
                const route = applications.flatMap(app => app.routes)
                    .find(r => r.method.toUpperCase() === method.toUpperCase() && r.path === path);

                if (!route) {
                    return {
                        content: [{ type: "text", text: `Endpoint ${method} ${path} not found.` }],
                        isError: true
                    };
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(route, null, 2)
                    }]
                };
            }
        );
    }

    private registerResources() {
        // Register the full OpenAPI spec
        this.mcpServer.resource(
            "openapi-spec",
            "mcp://api/openapi.json",
            {
                mimeType: "application/json"
            },
            async (uri) => {
                const { applications } = await this.analyzer.analyze();
                const endpoints = applications.flatMap(app =>
                    app.routes.map(r => ({
                        method: r.method,
                        path: r.path,
                        handler: r.handlerName,
                        summary: r.summary,
                        requestTypes: r.requestTypes,
                        responseType: r.responseType
                    }))
                );

                return {
                    contents: [{
                        uri: uri.href,
                        text: JSON.stringify(endpoints, null, 2)
                    }]
                };
            }
        );

        // Register source code access for routes
        this.mcpServer.resource(
            "route-source",
            "mcp://api/routes/{method}/{path}/source",
            {
                mimeType: "text/typescript"
            },
            async (uri, { method, path }) => {
                const { applications } = await this.analyzer.analyze();
                const route = applications.flatMap(app => app.routes)
                    .find(r => r.method.toUpperCase() === method.toUpperCase() && r.path === `/${path}`);

                if (!route) {
                    throw new Error(`Endpoint ${method} /${path} not found.`);
                }

                return {
                    contents: [{
                        uri: uri.href,
                        text: route.handlerSource || "// Source not available"
                    }]
                };
            }
        );
    }

    private registerPrompts() {
        this.mcpServer.prompt(
            "generate-client",
            {
                method: z.string(),
                path: z.string()
            },
            async ({ method, path }) => {
                const { applications } = await this.analyzer.analyze();
                const route = applications.flatMap(app => app.routes)
                    .find(r => r.method.toUpperCase() === method.toUpperCase() && r.path === path);

                if (!route) {
                    return {
                        messages: [{
                            role: "user",
                            content: {
                                type: "text",
                                text: `Start a new task to create a client for ${method} ${path}. The endpoint was not found in the current analysis.`
                            }
                        }]
                    };
                }

                return {
                    messages: [{
                        role: "user",
                        content: {
                            type: "text",
                            text: `Please generate a TypeScript client function for the following endpoint:
Method: ${route.method}
Path: ${route.path}
Summary: ${route.summary || 'N/A'}
Request Types: ${JSON.stringify(route.requestTypes, null, 2)}
Response Type: ${route.responseType || 'unknown'}

Use fetch or axios. Ensure proper typing.`
                        }
                    }]
                };
            }
        );

        this.mcpServer.prompt(
            "refactor-endpoint",
            {
                method: z.string(),
                path: z.string()
            },
            async ({ method, path }) => {
                const { applications } = await this.analyzer.analyze();
                const route = applications.flatMap(app => app.routes)
                    .find(r => r.method.toUpperCase() === method.toUpperCase() && r.path === path);

                if (!route) {
                    return {
                        messages: [{
                            role: "user",
                            content: {
                                type: "text",
                                text: `I want to refactor ${method} ${path} but it was not found.`
                            }
                        }]
                    };
                }

                return {
                    messages: [{
                        role: "user",
                        content: {
                            type: "text",
                            text: `Please review and refactor the following route handler code:

${route.handlerSource}

Suggestions:
1. Improve performance
2. Enhance error handling
3. Ensure type safety`
                        }
                    }]
                };
            }
        );

        this.mcpServer.prompt(
            "generate-tests",
            {
                method: z.string(),
                path: z.string()
            },
            async ({ method, path }) => {
                const { applications } = await this.analyzer.analyze();
                const route = applications.flatMap(app => app.routes)
                    .find(r => r.method.toUpperCase() === method.toUpperCase() && r.path === path);

                if (!route) {
                    return {
                        messages: [{
                            role: "user",
                            content: {
                                type: "text",
                                text: `I want to generate tests for ${method} ${path} but it was not found.`
                            }
                        }]
                    };
                }

                return {
                    messages: [{
                        role: "user",
                        content: {
                            type: "text",
                            text: `Please write unit tests for the following endpoint using bun:test:

Method: ${route.method}
Path: ${route.path}
Code:
${route.handlerSource}`
                        }
                    }]
                };
            }
        );
    }
}
