import { randomUUID } from "crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { ShokupanRouter } from "../../../router";
import type { Shokupan } from '../../../shokupan';
import { getProcess } from "../../../util/env";
import type { McpSession } from "../../../util/mcp-protocol";
import { getMetaFile } from "../../../util/runtime-types";
import { $appRoot, $childRouters } from "../../../util/symbol";
import type { Middleware, ShokupanPlugin } from "../../../util/types";
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
    /**
     * Authentication middleware to protect all MCP server endpoints.
     *
     * The MCP server exposes source code, OpenAPI specs, and endpoint
     * introspection. Without auth, anyone who can reach the MCP port can
     * read this data. Provide a middleware that validates credentials
     * (e.g. checks a bearer token, API key, or session) and returns a
     * 401/403 response if unauthenticated.
     *
     * @example
     * ```typescript
     * new MCPServerPlugin({
     *   auth: (ctx, next) => {
     *     const token = ctx.headers.get('authorization');
     *     if (token !== `Bearer ${process.env.MCP_TOKEN}`) {
     *       return ctx.text('Unauthorized', 401);
     *     }
     *     return next();
     *   }
     * })
     * ```
     */
    auth?: Middleware;
}

/**
 * Attaches an MCP server to the application. 
 * This MCP server is focus-designed to provide introspection and tool execution capabilities.
 * 
 * If your application design requires anything custom, implement your own MCP server.
 */
export class MCPServerPlugin implements ShokupanPlugin {
    private router = new ShokupanRouter();
    private [$appRoot]!: Shokupan;
    private analyzer!: OpenAPIAnalyzer;

    constructor(private options: MCPServerPluginOptions = {}) {
        this.options = { ...options };
        this.options.allowIntrospection ??= true;
        this.options.allowToolExecution ??= true;
        this.options.path ??= '/mcp';
        if (!this.options.path.startsWith('/')) {
            this.options.path = '/' + this.options.path;
        }
        this.options.rootDir ??= getProcess()?.cwd() || '.';
    }

    public onInit(app: Shokupan) {
        this[$appRoot] = app;

        // Initialize Analyzer
        this.analyzer = new OpenAPIAnalyzer(this.options.rootDir!, app.logger);

        // Register Tools
        if (this.options.allowIntrospection) {
            this.registerTools();
            this.registerResources();
            this.registerPrompts();
        }

        // Register async startup hook
        app.onStart(async () => {
            // Mount the router
            app.mount(this.options.path!, this.router);

            // Merge App/Router tools into this local router? 
            // The request says "This should also utilize with the previous work we've done".
            // If the user defines tools on controllers in the main app, they are registered in the main app's routers.
            // But here we are creating a separate router for /mcp endpoint.
            // We need to aggregate tools from the entire app tree into this router's protocol handler,
            // OR make the protocol handler aware of the whole app.
            // For now, let's just make sure tools registered on THIS plugin instances (if any) work.
            // But wait, user wants decorators on controllers to work.
            // Controllers are mounted on `app`.
            // So we need to walk the app tree and collect tools/prompts/resources.

            // We can do this on request or at startup.
            // Doing it on request allows dynamic updates but slower.
            // Doing it at startup is better.
            this.collectAppMcpItems(app);


            // Define Routes for SSE/JSON-RPC
            this.setupRoutes();

            // Metadata
            this.router.metadata = {
                file: getMetaFile(import.meta.url),
                line: 1,
                name: 'MCPServerPlugin',
                pluginName: 'MCP Server'
            };
        });
    }

    private collectAppMcpItems(app: Shokupan) {
        // Simple recursive collector
        const collect = (router: ShokupanRouter) => {
            if (router.mcpProtocol) {
                this.router.mcpProtocol.merge(router.mcpProtocol);
            }
            router[$childRouters]?.forEach(collect);
        };
        collect(app);
    }

    private sessions = new Map<string, McpSession>();

    private setupRoutes() {
        // Security: apply auth middleware to all MCP routes if configured.
        // The MCP server exposes source code, OpenAPI specs, and endpoint
        // introspection. Without auth, anyone reaching the port can read it.
        if (this.options.auth) {
            this.router.use(this.options.auth);
        }

        // SSE Endpoint (GET)
        this.router.get('', (ctx) => {
            const sessionId = randomUUID();
            const session = this.router.mcpProtocol.createSession(sessionId);
            this.sessions.set(sessionId, session);

            const base = ctx.request.url.replace(/\/$/, '');
            const endpointUrl = `${base}/message?sessionId=${sessionId}`;

            return new Response(
                new ReadableStream({
                    start(controller) {
                        session.attachStream(controller);
                        controller.enqueue(`event: endpoint\ndata: ${endpointUrl}\n\n`);
                        // Keep open
                    },
                    cancel: () => {
                        session.close();
                        this.sessions.delete(sessionId);
                    }
                }),
                {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                    }
                }
            );
        });

        // JSON-RPC Endpoint (POST)
        this.router.post('/message', async (ctx) => {
            const url = new URL(ctx.request.url);
            const sessionId = url.searchParams.get('sessionId');

            if (!sessionId) {
                return ctx.text('Missing sessionId', 400);
            }

            const session = this.sessions.get(sessionId);
            if (!session) {
                return ctx.text('Session not found', 404);
            }

            let parsedBody;
            try {
                parsedBody = await ctx.body();
            } catch (e) {
                return ctx.json({
                    jsonrpc: "2.0",
                    id: null,
                    error: { code: -32700, message: "Parse error" }
                }, 400);
            }

            const response = await session.handleMessage(parsedBody);

            if (response) {
                return ctx.json(response);
            }
            // Notification -> 202 Accepted or 204 No Content
            return ctx.text('', 204);
        });
    }

    private registerTools() {
        const ensureExecutionAllowed = () => {
            if (!this.options.allowToolExecution) {
                throw new Error("Tool execution is disabled.");
            }
        };

        this.router.tool(
            "list_endpoints",
            {},
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
            },
            "List all HTTP endpoints discovered in the application by analyzing its source. Returns each endpoint's HTTP method, path, handler name, and OpenAPI summary."
        );

        this.router.tool(
            "get_endpoint_details",
            {
                type: "object",
                properties: {
                    method: { type: "string" },
                    path: { type: "string" }
                },
                required: ["method", "path"]
            },
            async ({ method, path }: any) => {
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
            },
            "Get detailed information about a single endpoint, including its handler source, inferred request types (body/query/params/headers), inferred response type and JSON schema, emitted events, and source location. Provide the HTTP method (e.g. GET) and the route path as it appears in list_endpoints (e.g. /todos/{id})."
        );
    }

    private registerResources() {
        // Register the full OpenAPI spec
        this.router.resource(
            "mcp://api/openapi.json",
            {
                name: "openapi-spec",
                description: "The full OpenAPI-style endpoint catalog for the application, including methods, paths, handler names, summaries, inferred request types, and response types.",
                mimeType: "application/json"
            },
            async (uri: any) => {
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
                        uri: uri,
                        text: JSON.stringify(endpoints, null, 2)
                    }]
                };
            }
        );

        // Register source code access for routes
        this.router.resource(
            "mcp://api/routes/{method}/{path}/source",
            {
                name: "route-source",
                description: "Read the TypeScript source code of a specific route handler. Use the method and path as they appear in list_endpoints (path uses {param} form, e.g. mcp://api/routes/GET/todos/{id}/source).",
                mimeType: "text/typescript"
            },
            async (uri: any) => {
                // uri: mcp://api/routes/GET/todos/{id}/source
                // Format: mcp://api/routes/<METHOD>/<PATH>/source
                // PATH can contain slashes and {param} placeholders.
                const match = uri.match(/^mcp:\/\/api\/routes\/([^/]+)\/(.+)\/source$/);
                if (!match) {
                    throw new Error("Invalid MCP resource URI format. Expected mcp://api/routes/<METHOD>/<PATH>/source");
                }
                const method = match[1];
                const routePath = '/' + match[2];

                const { applications } = await this.analyzer.analyze();
                const route = applications.flatMap(app => app.routes)
                    .find(r => r.method.toUpperCase() === method.toUpperCase() && r.path === routePath);

                if (!route) {
                    throw new Error(`Endpoint ${method} ${routePath} not found.`);
                }

                const ctx = route.sourceContext;
                if (!ctx || !ctx.file) {
                    throw new Error(`No source location available for ${method} ${routePath}.`);
                }

                const filePath = isAbsolute(ctx.file) ? ctx.file : resolvePath(this.options.rootDir!, ctx.file);
                let source: string;
                try {
                    source = readFileSync(filePath, 'utf-8');
                } catch (e: any) {
                    throw new Error(`Could not read source file ${filePath}: ${e.message}`);
                }

                const lines = source.split(/\r?\n/);
                const start = Math.max(1, ctx.startLine);
                const end = Math.min(lines.length, ctx.endLine);
                const snippet = lines.slice(start - 1, end).join('\n');

                return {
                    contents: [{
                        uri: uri,
                        mimeType: "text/typescript",
                        text: `// ${ctx.file}:${start}-${end}\n${snippet}`
                    }]
                };
            }
        );
    }

    private registerPrompts() {
        this.router.prompt(
            "generate-client",
            [
                { name: "method", required: true },
                { name: "path", required: true }
            ],
            async ({ method, path }: any) => {
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
            },
            "Generate a typed TypeScript client function for a specific endpoint. Provide the HTTP method (e.g. GET) and the route path as it appears in list_endpoints (e.g. /todos/{id}). Returns a prompt pre-filled with the endpoint's inferred request and response types."
        );

        // ... (Other prompts omitted for brevity/simplicity, logic is identical)
    }
}
