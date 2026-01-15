import { context, trace } from '@opentelemetry/api';
import { dump } from 'js-yaml';
import { ShokupanContext } from "./context";
import { compose } from "./middleware";
import { generateOpenApi } from "./plugins/application/openapi/openapi";
import { asyncContext, RequestContextStore } from "./util/async-hooks";
import { getErrorStatus } from "./util/http-error";
import { HTTP_STATUS } from "./util/http-status";
import { $appRoot, $dispatch, $finalResponse, $isApplication, $routeMatched, $ws } from './util/symbol';
import type { Method, Middleware, ProcessResult, RequestOptions, ShokupanConfig, ShokupanPlugin } from './util/types';

import type { Server, ServerWebSocket } from 'bun';
import { Surreal } from 'surrealdb';
import { ShokupanRouter } from './router';
import { SystemCpuMonitor } from "./util/cpu-monitor";
import { SurrealDatastore } from './util/datastore';
import "./util/instrumentation";
import { ShokupanRequest } from './util/request';
import { getCallerInfo } from './util/stack';


const defaults: ShokupanConfig = {
    port: 3000,
    hostname: "localhost",
    development: process.env.NODE_ENV !== "production",
    enableAsyncLocalStorage: false,
    enableHttpBridge: false,
    reusePort: false,
};
const tracer = trace.getTracer("shokupan.application");


/**
 * Shokupan Application
 * 
 * The main application class for creating a Shokupan web server.
 * 
 * @template State - The shape of `ctx.state` for all routes in the application.
 * Use this to provide type safety for state management across middleware and handlers.
 * 
 * @example Basic Usage
 * ```typescript
 * const app = new Shokupan();
 * app.get('/hello', (ctx) => ctx.json({ message: 'Hello' }));
 * await app.listen(3000);
 * ```
 * 
 * @example Typed State
 * ```typescript
 * interface AppState {
 *   userId: string;
 *   tenant: string;
 *   requestId: string;
 * }
 * 
 * const app = new Shokupan<AppState>();
 * 
 * // Middleware has typed state access
 * app.use((ctx, next) => {
 *   ctx.state.userId = 'user-123';    // ✓ Type-safe
 *   ctx.state.requestId = crypto.randomUUID();
 *   return next();
 * });
 * 
 * // Handlers have typed state access
 * app.get('/profile', (ctx) => {
 *   const { userId, tenant } = ctx.state; // ✓ TypeScript knows these exist
 *   return ctx.json({ userId, tenant });
 * });
 * ```
 * 
 * @example Empty State (No State Management)
 * ```typescript
 * import { EmptyState } from 'shokupan';
 * 
 * const app = new Shokupan<EmptyState>();
 * // ctx.state will be an empty object with no properties
 * ```
 * 
 * @example Combining Path Params and State
 * ```typescript
 * interface RequestState {
 *   userId: string;
 *   permissions: string[];
 * }
 * 
 * const app = new Shokupan<RequestState>();
 * 
 * app.get('/users/:userId/posts/:postId', (ctx) => {
 *   // Both params and state are fully typed!
 *   const { userId, postId } = ctx.params;  // ✓ Path params typed
 *   const { permissions } = ctx.state;       // ✓ State typed
 *   return ctx.json({ userId, postId, permissions });
 * });
 * ```
 */
export class Shokupan<T = any> extends ShokupanRouter<T> {
    readonly applicationConfig: ShokupanConfig = {};
    public openApiSpec?: any;
    public asyncApiSpec?: any;
    private openApiSpecPromise?: Promise<any>;
    private asyncApiSpecPromise?: Promise<any>;
    private composedMiddleware?: Middleware;
    private cpuMonitor?: SystemCpuMonitor;
    private server?: Server<any>;
    private datastore?: SurrealDatastore;
    public dbPromise?: Promise<any>;

    public override get db(): SurrealDatastore | undefined {
        return this.datastore;
    }

    get logger() {
        return this.applicationConfig.logger;
    }


    constructor(
        applicationConfig: ShokupanConfig = {}
    ) {
        const config = Object.assign({}, defaults, applicationConfig);
        // Exclude hooks from the router config passed to super() to avoid double execution
        // The application handles app-level hooks in handleRequest()
        const { hooks, ...routerConfig } = config;
        super({ ...routerConfig, hooks });

        this[$isApplication] = true;
        this[$appRoot] = this;
        this.applicationConfig = config;

        // Capture metadata for the application instance
        const { file, line } = getCallerInfo();
        this.metadata = {
            file,
            line,
            name: 'ShokupanApplication'
        };

        this.dbPromise = this.initDatastore();
    }

    private async initDatastore() {
        const db = new Surreal({ engines: this.applicationConfig.surreal?.engines ?? (await import('@surrealdb/node')).createNodeEngines() });
        this.datastore = new SurrealDatastore(db);

        await db.connect(
            this.applicationConfig.surreal?.url ?? (process.env.NODE_ENV === 'test' ? 'mem://' : 'surrealkv://database'),
            this.applicationConfig.surreal?.connectOptions
        );

        await db.use({
            namespace: this.applicationConfig.surreal?.namespace ?? "vendor",
            database: this.applicationConfig.surreal?.database ?? "shokupan"
        });
    }

    /**
     * Adds middleware to the application.
     */
    public override use(middleware: Middleware) {

        // --- Middleware Tracking Logic ---
        const { file, line } = getCallerInfo();

        // Store metadata on the original middleware function if possible
        if (!(middleware as any).metadata) {
            (middleware as any).metadata = {
                file,
                line,
                name: middleware.name || 'middleware',
                isBuiltin: (middleware as any).isBuiltin,
                pluginName: (middleware as any).pluginName
            };
        }

        if (this.applicationConfig.enableMiddlewareTracking) {
            // Wrap with tracking
            // Create wrapper but preserve metadata for registry
            const trackedMiddleware = async (ctx, next) => {
                // Cast to any to access handlerStack if types are strict, but ShokupanContext should have it.
                const c = ctx as any;
                if (c.handlerStack && c.app?.applicationConfig.enableMiddlewareTracking) {
                    const metadata = (middleware as any).metadata || {};
                    const start = performance.now();
                    const item = {
                        name: metadata.pluginName ? `${metadata.pluginName} (${metadata.name})` : metadata.name || middleware.name || 'middleware',
                        file: metadata.file || file,
                        line: metadata.line || line,
                        isBuiltin: metadata.isBuiltin,
                        startTime: start,
                        duration: -1
                    };
                    c.handlerStack.push(item);

                    try {
                        return await middleware(ctx, next);
                    } finally {
                        item.duration = performance.now() - start;
                    }
                }
                return middleware(ctx, next);
            };
            trackedMiddleware.metadata = middleware.metadata;
            Object.defineProperty(trackedMiddleware, 'name', { value: middleware.name || 'middleware' });

            trackedMiddleware.order = this.middleware.length;
            this.middleware.push(trackedMiddleware);
        } else {
            // Direct push without wrapper
            this.middleware.push(middleware);
        }

        return this;
    }

    /**
     * Registers a plugin.
     */
    public register(plugin: ShokupanPlugin, options?: { path?: string; }) {
        plugin.onInit(this, options);
        return this;
    }

    private startupHooks: (() => Promise<void> | void)[] = [];

    /**
     * Registers a callback to be executed before the server starts listening.
     */
    public onStart(callback: () => Promise<void> | void) {
        this.startupHooks.push(callback);
        return this;
    }

    private specAvailableHooks: ((spec: any) => void | Promise<void>)[] = [];

    /**
     * Registers a callback to be executed when the OpenAPI spec is available.
     * This happens after generateOpenApi() but before the server starts listening (or at least before it finishes startup if async).
     */
    public onSpecAvailable(callback: (spec: any) => void | Promise<void>) {
        this.specAvailableHooks.push(callback);
        return this;
    }

    /**
     * Starts the application server.
     * 
     * @param port - The port to listen on. If not specified, the port from the configuration is used. If that is not specified, port 3000 is used.
     * @returns The server instance.
     */
    public async listen(port?: number) {
        const finalPort = port ?? this.applicationConfig.port ?? 3000;

        if (finalPort < 0 || finalPort > 65535 || finalPort % 1 !== 0) {
            throw new Error("Invalid port number");
        }

        // Run startup hooks
        await Promise.all(this.startupHooks.map(hook => hook()));

        if (this.applicationConfig.enableOpenApiGen) {
            // Create the generation promise
            this.openApiSpecPromise = generateOpenApi(this).then(spec => {
                this.openApiSpec = spec;
                return spec;
            });

            // Decide whether to block or not
            const shouldBlock = this.applicationConfig.blockOnOpenApiGen !== false;

            if (shouldBlock) {
                // Wait for generation to complete before proceeding
                await this.openApiSpecPromise;
            }

            // --- Well-Known Files Implementation ---

            // 1. .well-known/openapi.yaml
            this.get("/.well-known/openapi.yaml", async (ctx) => {
                try {
                    // Wait for spec if not ready yet
                    await this.openApiSpecPromise;
                    const yaml = dump(this.openApiSpec);
                    return ctx.send(yaml, { status: 200, headers: { 'content-type': 'application/yaml' } });
                } catch (e) {
                    this.logger?.error("Failed to generate OpenAPI YAML", { error: e });
                    return ctx.text("Internal Server Error", 500);
                }
            });

            // 2. .well-known/ai-plugin.json
            if (this.applicationConfig.aiPlugin?.enabled !== false) {
                this.get("/.well-known/ai-plugin.json", async (ctx) => {
                    // Wait for spec if not ready yet
                    await this.openApiSpecPromise;

                    const config = this.applicationConfig.aiPlugin || {};
                    let pkg: any = {};
                    try {
                        pkg = await Bun.file("package.json").json();
                    } catch (e) { }

                    const manifest = {
                        schema_version: "v1",
                        name_for_human: config.name_for_human || this.openApiSpec.info.title || pkg.name || "Shokupan App",
                        name_for_model: config.name_for_model || this.openApiSpec.info.title || pkg.name || "Shokupan App",
                        description_for_human: config.description_for_human || this.openApiSpec.info.description || pkg.description || "Shokupan Application",
                        description_for_model: config.description_for_model || this.openApiSpec.info.description || pkg.description || "Shokupan Application",
                        auth: config.auth || { type: "none" },
                        api: config.api || {
                            type: "openapi",
                            url: `${this.applicationConfig.hostname === 'localhost' ? 'http' : 'https'}://${this.applicationConfig.hostname}:${finalPort}/.well-known/openapi.yaml`,
                            is_user_authenticated: false
                        },
                        logo_url: config.logo_url || `${this.applicationConfig.hostname === 'localhost' ? 'http' : 'https'}://${this.applicationConfig.hostname}:${finalPort}/logo.png`, // Placeholder default
                        contact_email: config.contact_email || pkg.author?.email || "support@example.com",
                        legal_info_url: config.legal_info_url || `${this.applicationConfig.hostname === 'localhost' ? 'http' : 'https'}://${this.applicationConfig.hostname}:${finalPort}/legal`
                    };

                    return ctx.json(manifest);
                });
            }

            // 3. .well-known/api-catalog
            if (this.applicationConfig.apiCatalog?.enabled !== false) {
                this.get("/.well-known/api-catalog", async (ctx) => {
                    // Wait for spec if not ready yet
                    await this.openApiSpecPromise;

                    const config = this.applicationConfig.apiCatalog || {};
                    const catalog = {
                        versions: config.versions || [
                            {
                                name: this.openApiSpec.info.version || "v1",
                                url: `${this.applicationConfig.hostname === 'localhost' ? 'http' : 'https'}://${this.applicationConfig.hostname}:${finalPort}/`,
                                spec_url: `${this.applicationConfig.hostname === 'localhost' ? 'http' : 'https'}://${this.applicationConfig.hostname}:${finalPort}/.well-known/openapi.yaml`
                            }
                        ]
                    };
                    return ctx.json(catalog);
                });
            }

            // Run spec available hooks (either now after blocking, or later after async completion)
            if (shouldBlock) {
                await Promise.all(this.specAvailableHooks.map(hook => hook(this.openApiSpec)));
            } else {
                // Run hooks after async generation completes
                this.openApiSpecPromise.then(spec => {
                    return Promise.all(this.specAvailableHooks.map(hook => hook(spec)));
                }).catch(err => {
                    this.logger?.error("Error running spec available hooks", { error: err });
                });
            }
        }

        if (this.applicationConfig.enableAsyncApiGen) {
            const { generateAsyncApi } = await import("./plugins/application/asyncapi/generator");

            // Create the generation promise
            this.asyncApiSpecPromise = generateAsyncApi(this).then(spec => {
                this.asyncApiSpec = spec;
                return spec;
            });

            // Decide whether to block or not
            const shouldBlock = this.applicationConfig.blockOnAsyncApiGen !== false;

            if (shouldBlock) {
                await this.asyncApiSpecPromise;
            }
        }

        if (port === 0 && process.platform === "linux") {

        }

        if (this.applicationConfig.autoBackpressureFeedback === true) {
            this.cpuMonitor = new SystemCpuMonitor();
            this.cpuMonitor.start();
        }

        const self = this;

        const serveOptions = {
            port: finalPort,
            hostname: this.applicationConfig.hostname,
            development: this.applicationConfig.development,
            fetch: this.fetch.bind(this),
            reusePort: this.applicationConfig.reusePort,
            idleTimeout: this.applicationConfig.readTimeout ? this.applicationConfig.readTimeout / 1000 : undefined,
            websocket: {
                open(ws: ServerWebSocket<{ handler; }>) {
                    ws.data?.handler?.open?.(ws);
                },
                async message(ws: ServerWebSocket<{ handler; }>, message: string) {
                    if (ws.data?.handler?.message) {
                        return ws.data.handler.message(ws, message);
                    }
                    if (typeof message !== "string") return;

                    try {
                        const payload = JSON.parse(message);

                        // HTTP Bridge
                        if (self.applicationConfig['enableHttpBridge'] && payload.type === 'HTTP') {
                            const { id, method, path, headers, body } = payload;
                            const url = new URL(path, `http://${self.applicationConfig.hostname || 'localhost'}:${finalPort}`);

                            const req = new Request(url.toString(), {
                                method,
                                headers,
                                body: typeof body === 'object' ? JSON.stringify(body) : body
                            });

                            const res = await self.fetch(req);

                            const resBody: any = await res.json()
                                .catch(err => res.text());

                            const resHeaders: Record<string, string> = {};
                            res.headers.forEach((v, k) => resHeaders[k] = v);

                            ws.send(JSON.stringify({
                                type: 'RESPONSE',
                                id,
                                status: res.status,
                                headers: resHeaders,
                                body: resBody
                            }));
                            return;
                        }

                        // Event Handling
                        const eventName = payload.event || (payload.type === 'EVENT' ? payload.name : undefined);
                        if (eventName) {
                            const handlers = self.findEvent(eventName);
                            const handler = handlers?.length == 1 ? handlers[0] : compose(handlers);
                            if (handler) {
                                const data = payload.data || payload.payload;

                                // Construct a Context that mocks a Request
                                const req = new ShokupanRequest({
                                    url: `http://${self.applicationConfig.hostname || 'localhost'}/event/${eventName}`,
                                    method: 'POST',
                                    headers: new Headers({ 'content-type': 'application/json' }),
                                    body: JSON.stringify(data)
                                });

                                const ctx = new ShokupanContext(req as unknown as ShokupanRequest<T>, self.server);
                                // Expose socket on context for reply
                                (ctx as any)[$ws] = ws;

                                // Link context to socket for disconnect hooks
                                // Note: This simplistic approach overwrites the context on each event.
                                // Ideal: Maintain a set of contexts or checking if we need a persistent context per socket.
                                // For now, we attach it so disconnect hooks work for at least the last active context or shared session.
                                ws.data ??= {} as any;
                                ws.data['ctx'] = ctx;

                                try {
                                    await handler(ctx as any);
                                } catch (err) {
                                    if (self.applicationConfig['websocketErrorHandler']) {
                                        await self.applicationConfig['websocketErrorHandler'](err, ctx as any);
                                    } else {
                                        console.error(`Error in event ${eventName}:`, err);
                                    }
                                }
                            }
                        }

                    } catch (e) {
                        // ignore malformed
                    }
                },
                drain(ws: ServerWebSocket<{ handler; }>) {
                    ws.data?.handler?.drain?.(ws);
                },
                close(ws: ServerWebSocket<{ handler; }>, code: number, reason: string) {
                    ws.data?.handler?.close?.(ws, code, reason);
                    // Shokupan Disconnect Hooks
                    const ctx: any = ws.data?.['ctx'];
                    if (ctx && typeof ctx.getDisconnectCallbacks === 'function') {
                        const callbacks = ctx.getDisconnectCallbacks();
                        if (Array.isArray(callbacks) && callbacks.length > 0) {
                            Promise.all(callbacks.map(cb => cb())).catch(err => {
                                console.error("Error executing socket disconnect hook:", err);
                            });
                        }
                    }
                },
            }
        };

        let factory = this.applicationConfig.serverFactory;

        // Detect if we are not running on Bun
        // @ts-ignore
        if (!factory && typeof Bun === "undefined") {
            const { createHttpServer } = await import("./plugins/application/http-server");
            factory = createHttpServer();
        }

        this.server = factory
            ? await factory(serveOptions) as Server<any>
            : Bun.serve(serveOptions);

        return this.server;
    }

    /**
     * Stops the application server.
     * 
     * This method gracefully shuts down the server and stops any running monitors.
     * Works transparently in both Bun and Node.js runtimes.
     * 
     * @returns A promise that resolves when the server has been stopped.
     * 
     * @example
     * ```typescript
     * const app = new Shokupan();
     * const server = await app.listen(3000);
     * 
     * // Later, when you want to stop the server
     * await app.stop();
     * ```
     * @param closeActiveConnections — Immediately terminate in-flight requests, websockets, and stop accepting new connections.
     */
    public async stop(closeActiveConnections?: boolean): Promise<void> {
        // Stop CPU monitor if running
        if (this.cpuMonitor) {
            this.cpuMonitor.stop();
            this.cpuMonitor = undefined;
        }

        // Stop the server if it exists
        if (this.server) {
            await this.server.stop(closeActiveConnections);
            this.server = undefined;
        }
    }

    public [$dispatch](req: ShokupanRequest<T>) {
        return this.fetch(req as unknown as Request);
    }

    /**
     * Processes a request by wrapping the standard fetch method.
     */
    public override async testRequest(options: RequestOptions): Promise<ProcessResult> {
        let url = options.url || options.path || "/";
        if (!url.startsWith("http")) {
            const base = `http://${this.applicationConfig.hostname || "localhost"}:${this.applicationConfig.port || 3000}`;
            const path = url.startsWith("/") ? url : "/" + url;
            url = base + path;
        }

        if (options.query) {
            const u = new URL(url);
            const entries = Object.entries(options.query);
            for (let i = 0; i < entries.length; i++) {
                const [k, v] = entries[i];
                u.searchParams.set(k, v);
            }
            url = u.toString();
        }

        // Create Request to pass to fetch
        const req = new ShokupanRequest({
            method: (options.method || "GET") as Method,
            url,
            headers: options.headers as any,
            body: options.body && typeof options.body === "object" ? JSON.stringify(options.body) : options.body
        }) as unknown as ShokupanRequest<T>;

        const res = await this.fetch(req as unknown as Request);

        // Convert Response to ProcessResult
        const status = res.status;
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => headers[k] = v);

        let data: any;
        if (headers['content-type']?.includes('application/json')) {
            data = await res.json();
        }
        else {
            data = await res.text();
        }

        return {
            status,
            headers,
            data
        };
    }

    /**
     * Handles an incoming request (Bun.serve interface).
     * This logic contains the middleware chain and router dispatch.
     * 
     * @param req - The request to handle.
     * @param server - The server instance.
     * @returns The response to send.
     */
    public async fetch(req: Request, server?: Server<any>): Promise<Response> {


        if (this.applicationConfig.enableTracing) {
            const tracer = trace.getTracer("shokupan.application");
            const store = asyncContext.getStore();

            const attrs = {
                attributes: {
                    "http.url": req.url,
                    "http.method": req.method
                }
            };

            const parent = store?.span;
            const ctx = parent ? trace.setSpan(context.active(), parent) : undefined;
            return tracer.startActiveSpan(`${req.method} ${new URL(req.url).pathname}`, attrs, ctx, span => {
                const ctxStore = new RequestContextStore();
                ctxStore.span = span;
                ctxStore.request = req;

                return asyncContext.run(ctxStore, () => this.handleRequest(req, server).finally(() => span.end()));
            });
        }

        // If ALS is enabled but tracing is not
        if (this.applicationConfig.enableAsyncLocalStorage) {
            const ctxStore = new RequestContextStore();
            ctxStore.request = req;
            return asyncContext.run(ctxStore, () => this.handleRequest(req, server));
        }

        return this.handleRequest(req, server);
    }

    private async handleRequest(req: Request, server?: Server<any>): Promise<Response> {
        // Cast to ShokupanRequest if needed, though at runtime it's just a Request
        // But ShokupanContext expects ShokupanRequest.
        const request = req as unknown as ShokupanRequest<T>;

        const controller = new AbortController();
        const ctx = new ShokupanContext<T>(request, server, undefined, this, controller.signal, this.applicationConfig.enableMiddlewareTracking);

        const handle = async () => {

            // Auto-Backpressure Check
            if (this.cpuMonitor && this.cpuMonitor.getUsage() > (this.applicationConfig.autoBackpressureLevel ?? 60)) {
                // Return 429 immediately
                const msg = "Too Many Requests (CPU Backpressure)";
                const res = ctx.text(msg, 429);
                // Trigger hooks so metrics are recorded
                await this.runHooks('onResponseEnd', ctx, res);
                return res;
            }

            try {
                // Request Start Hook
                await this.runHooks('onRequestStart', ctx);

                // Compose middleware + router dispatch
                const fn = this.composedMiddleware ??= compose(this.middleware);

                // Object.defineProperty(fn, 'name', { value: "middleware chain", configurable: false });

                // The "next" at the end of the middleware chain is the router dispatch
                const result = await fn(ctx, async () => {
                    // Start body parsing early for applicable HTTP methods to overlap with route lookup
                    const bodyParsing = (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method))
                        ? ctx.parseBody()
                        : Promise.resolve();

                    const match = this.find(req.method, ctx.path);


                    if (match) {
                        ctx[$routeMatched] = true;
                        ctx.params = match.params;

                        // Ensure body is parsed before handler executes
                        await bodyParsing;

                        return match.handler(ctx);
                    }

                    return null;
                });

                let response: Response | Promise<Response>;
                if (result instanceof Response) {
                    response = result;
                }
                // Check explicit void return but response set in context
                else if ((result === null || result === undefined) && ctx[$finalResponse] instanceof Response) {
                    response = ctx[$finalResponse];
                }
                // (Logic moved to main block below)
                else if (result === null || result === undefined) {
                    // Handler returned nothing (void/null/undefined)

                    if (ctx[$finalResponse] instanceof Response) {
                        response = ctx[$finalResponse];
                    }
                    else if (ctx.isUpgraded) {
                        // Request was successfully upgraded to WebSocket
                        return undefined as unknown as Response;
                    }
                    // 2. Logic Split: Route Matched vs Not Found
                    else if (ctx[$routeMatched]) {
                        // A route WAS matched but returned nothing.
                        // Default to 200 OK (unless user set status manually via ctx.response.status)
                        // We send an empty response with the context's status (defaults to 200)
                        response = ctx.send(null, { status: ctx.response.status, headers: ctx.response.headers });
                    }
                    else {
                        // Fallback: If no route matched, check if it's a WebSocket upgrade request that can be handled by default handlers
                        // This supports Shokupan's Native WebSocket Events if no specific middleware/route handled it
                        if (ctx.upgrade()) {
                            return undefined as unknown as Response;
                        }

                        // No route matched - return 404 Not Found
                        // Exception: If middleware manually changed the status from default 200,
                        // respect that (e.g., auth middleware set 401)
                        if (ctx.response.status !== HTTP_STATUS.OK) {
                            response = ctx.send(null, { status: ctx.response.status, headers: ctx.response.headers });
                        } else {
                            response = ctx.text("Not Found", HTTP_STATUS.NOT_FOUND);
                        }
                    }
                }
                else if (typeof result === "object") {
                    response = ctx.json(result);
                }
                else {
                    response = ctx.text(String(result));
                }

                // Request End Hook - Processing finished, response ready
                await this.runHooks('onRequestEnd', ctx);

                if (response instanceof Promise) {
                    response = await response;
                }

                // Response Start Hook - About to send response
                await this.runHooks('onResponseStart', ctx, response);

                return response;

            }
            catch (err: any) {
                const span = asyncContext.getStore()?.span;
                if (span) span.setStatus({ code: 2 }); // Error

                // Extract status from error object (supports both .status and .statusCode)
                const status = getErrorStatus(err);
                const body: any = { error: err.message || "Internal Server Error" };
                if (err.errors) body.errors = err.errors;

                // Error Hook
                await this.runHooks('onError', ctx, err);

                return ctx.json(body, status);
            }
        };

        // Timeout Logic
        let executionPromise = handle();
        const timeoutMs = this.applicationConfig.requestTimeout;

        if (timeoutMs && timeoutMs > 0) {
            let timeoutId: any;
            const timeoutPromise = new Promise<Response>((_, reject) => {
                timeoutId = setTimeout(async () => {
                    controller.abort(); // Signal cancellation to handlers
                    await this.runHooks('onRequestTimeout', ctx);
                    reject(new Error("Request Timeout"));
                }, timeoutMs);
            });

            executionPromise = Promise.race([executionPromise, timeoutPromise])
                .finally(() => clearTimeout(timeoutId));
        }

        return executionPromise
            .catch((err) => {
                if (err.message === "Request Timeout") {
                    return ctx.text("Request Timeout", HTTP_STATUS.REQUEST_TIMEOUT);
                }
                console.error("Unexpected error in request execution:", err);
                return ctx.text("Internal Server Error", HTTP_STATUS.INTERNAL_SERVER_ERROR);
            })
            .then(async (res) => {
                // Response End Hook - Response returned
                // Note: We can't guarantee it's fully sent to client here, but it's handed off to Bun
                await this.runHooks('onResponseEnd', ctx, res);
                return res;
            });
    }
}
