import type { Server } from 'bun';
import { nanoid } from 'nanoid';
import { ShokupanContext } from "./context";
import { compose } from "./middleware";
import { ApiExplorerPlugin } from './plugins/application/api-explorer/plugin';
import { AsyncApiPlugin } from './plugins/application/asyncapi/plugin';
import DashboardPlugin from './plugins/application/dashboard/plugin';
import { ErrorView } from './plugins/application/error-view/index';
import { generateOpenApi } from "./plugins/application/openapi/openapi";
import { ShokupanRouter } from './router';
import { ShokupanServer } from './server';
import type { DatastoreAdapter } from './util/adapter/datastore';
import { DefaultFileSystemAdapter } from './util/adapter/filesystem';
import { asyncContext, RequestContextStore } from "./util/async-hooks";
import { SystemCpuMonitor } from "./util/cpu-monitor";
import { getErrorStatus, NotFoundError } from "./util/http-error";
import { HTTP_STATUS } from "./util/http-status";
import { configureIde } from './util/ide';
import { createLogger } from './util/logger';

import { Container } from './decorators';
import { getCallerInfo } from './decorators/util/stack';
import { MiddlewareTracker } from './util/middleware-tracker';
import { enablePromisePatch, kContext } from './util/promise';
import { ShokupanRequest } from './util/request';
import { type ResponseTransformer, ResponseTransformerRegistry } from './util/response-transformer';
import { $appRoot, $childRouters, $dispatch, $finalResponse, $isApplication, $mountPath, $routeMatched, $routes } from './util/symbol';
import { RouterTrie } from './util/trie';
import type { ErrorHandler, Method, Middleware, ProcessResult, RequestOptions, ShokupanConfig, ShokupanPlugin } from './util/types';


const defaults: ShokupanConfig = {
    port: 3000,
    hostname: "localhost",
    development: process.env.NODE_ENV !== "production",
    enableAsyncLocalStorage: false,
    enableHttpBridge: false,
    enableOpenApiGen: true,
    enableAsyncAstScanning: true,
    blockOnOpenApiGen: false,
    blockOnAsyncApiGen: false,
    astAnalysisTimeout: 30000,
    reusePort: false,
    enableAutoContentNegotiation: false,
    defaultResponseTransformer: 'application/json'
};


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
    public server?: Server<any>;
    private httpServer?: ShokupanServer;
    private datastore?: DatastoreAdapter;
    public dbPromise?: Promise<any>;
    public responseTransformerRegistry: ResponseTransformerRegistry;
    private errorHandlers: { type: any, handler: ErrorHandler; }[] = [];

    // Performance: Flattened Router Trie
    private rootTrie?: RouterTrie<T>;
    private startupHooks: (() => Promise<void> | void)[] = [];
    private specAvailableHooks: ((spec: any) => void | Promise<void>)[] = [];


    public get db(): DatastoreAdapter | undefined {
        return this.datastore;
    }

    override get logger() {
        return this.applicationConfig.logger;
    }

    constructor(
        applicationConfig: ShokupanConfig = {}
    ) {
        const config = Object.assign({}, defaults, applicationConfig);

        // Initialize Default FileSystem Adapter if not provided
        config.fileSystem ??= new DefaultFileSystemAdapter();

        // Configure IDE Links
        configureIde({ ide: config.ide });

        // Exclude hooks from the router config passed to super() to avoid double execution
        // The application handles app-level hooks in handleRequest()
        const { hooks, ...routerConfig } = config;
        super({ ...routerConfig, hooks });

        this[$isApplication] = true;
        this[$appRoot] = this;
        this.applicationConfig = config;

        // Initialize logger if not provided
        this.applicationConfig.logger ??= createLogger(this.applicationConfig.development ? 'development' : 'production');

        // Initialize response transformer registry
        this.responseTransformerRegistry = new ResponseTransformerRegistry();

        // Set default transformer
        if (this.applicationConfig.defaultResponseTransformer) {
            this.responseTransformerRegistry.setDefault(this.applicationConfig.defaultResponseTransformer);
        }

        // Register built-in transformers
        this.responseTransformerRegistry.register({
            contentType: 'application/json',
            serialize: (data) => ({
                body: JSON.stringify(data),
                headers: { 'content-type': 'application/json' }
            })
        });

        this.responseTransformerRegistry.register({
            contentType: 'text/plain',
            serialize: (data) => ({
                body: String(data),
                headers: { 'content-type': 'text/plain; charset=utf-8' }
            })
        });

        this.responseTransformerRegistry.register({
            contentType: 'text/html',
            serialize: (data) => ({
                body: String(data),
                headers: { 'content-type': 'text/html; charset=utf-8' }
            })
        });

        // Capture metadata for the application instance
        const { file, line } = getCallerInfo();
        this.metadata = {
            file,
            line,
            name: 'ShokupanApplication'
        };

        // Security: Apply default security headers
        if (this.applicationConfig.defaultSecurityHeaders) {
            const { SecurityHeaders } = require("./plugins/middleware/security-headers");
            this.use(SecurityHeaders(this.applicationConfig.defaultSecurityHeaders === true ? {} : this.applicationConfig.defaultSecurityHeaders));
        }

        if (this.applicationConfig.adapter !== 'wintercg') {
            this.dbPromise = this.initDatastore().catch(err => {
                // Log but don't crash if optional datastore init fails
                this.logger?.debug('Shokupan', "Failed to initialize default datastore", { error: err });
            });
        }

        if (this.applicationConfig.enablePromiseMonkeypatch) {
            enablePromisePatch();

            // Register global handler for unhandled rejections to log with context
            // We use process.prependListener if available to try to catch it before others, 
            // or just on() 
            // Note: In Bun, unhandledRejection might behave slightly differently than Node.
            const processRef = typeof process !== 'undefined' ? process : undefined;
            if (processRef && processRef.on) {
                processRef.on('unhandledRejection', (reason: any, promise: any) => {
                    const ctx = promise?.[kContext];
                    // Check if this promise belongs to this app's context
                    if (ctx && ctx.store && ctx.store.app === this) {
                        const { requestId } = ctx.store;
                        this.logger.error('Shokupan', "Unhandled Rejection in Shokupan Request", {
                            error: reason,
                            requestId,
                            creationStack: ctx.stack
                        });
                    }
                });
            }
        }
    }

    /**
     * Register a custom response transformer
     * @param transformer The transformer to register
     */
    public registerResponseTransformer(transformer: ResponseTransformer): this {
        this.responseTransformerRegistry.register(transformer);
        return this;
    }

    /**
     * Register a global error handler for a specific error type.
     * Handlers are checked in reverse order of registration (LIFO).
     * 
     * @param type The error class constructor (e.g., Error, CustomError)
     * @param handler The handler function
     */
    public onStrictError<T>(type: new (...args: any[]) => T, handler: ErrorHandler<T>): this {
        this.errorHandlers.unshift({ type, handler });
        return this;
    }

    /**
     * Set the default response transformer content type
     * @param contentType The content type to use as default
     */
    public setDefaultResponseType(contentType: string): this {
        this.responseTransformerRegistry.setDefault(contentType);
        return this;
    }

    private async initDatastore() {
        // Default to 'surrealdb' for backward compatibility
        const adapterName = this.applicationConfig.datastore?.adapter || 'surrealdb';
        const options = this.applicationConfig.datastore?.options || {};

        try {
            switch (adapterName) {
                case 'sqlite': {
                    const { SqliteAdapter } = await import('./util/adapter/datastore/sqlite');
                    this.datastore = new SqliteAdapter(options);
                    break;
                }
                case 'level': {
                    const { LevelAdapter } = await import('./util/adapter/datastore/level');
                    // For leveldb we might need more setup or injection if it's not just a location string
                    // But let's assume options has what it needs or we default reasonable values
                    this.datastore = new LevelAdapter(options);
                    break;
                }
                case 'surrealdb': {
                    const { SurrealAdapter } = await import('./util/adapter/datastore/surreal');
                    // Forward legacy config if present
                    const legacyConfig = this.applicationConfig.surreal || {};
                    const effectiveOptions = { ...legacyConfig, ...options };
                    this.datastore = new SurrealAdapter(effectiveOptions);
                    break;
                }
                case 'knex': {
                    const { KnexAdapter } = await import('./util/adapter/datastore/knex');
                    this.datastore = new KnexAdapter(options || {});
                    break;
                }
                default: {
                    // Determine default behavior if adapter not specified
                    // Old default: SurrealDB
                    const { SurrealAdapter } = await import('./util/adapter/datastore/surreal');
                    // Support legacy config
                    const legacy = this.applicationConfig.surreal;
                    this.datastore = new SurrealAdapter(options || legacy || {});
                }
            }

            if (this.datastore) {
                await this.datastore.connect();
                await this.datastore.setupSchema();
            }
        } catch (err) {
            this.logger?.error('Shokupan', "Failed to initialize datastore", { error: err });
            throw err;
        }
    }

    /**
     * Adds middleware to the application.
     */
    /**
     * Adds middleware to the application.
     */
    public override use(middleware: Middleware) {

        // --- Middleware Tracking Logic ---
        const { file, line } = getCallerInfo();

        const wrapped = MiddlewareTracker.wrap(middleware, {
            file,
            line,
            name: middleware.name || 'middleware',
            isBuiltin: (middleware as any).isBuiltin,
            pluginName: (middleware as any).pluginName
        });

        if (this.applicationConfig.enableMiddlewareTracking) {
            (wrapped as any).order = this.middleware.length;
            this.middleware.push(wrapped);
        } else {
            this.middleware.push(middleware);
        }

        return this;
    }

    /**
     * Registers a plugin.
     */
    public async register(plugin: ShokupanPlugin, options?: { path?: string; }) {
        try {
            await plugin.onInit(this, options);
        }
        catch (err) {
            this.logger?.error('Shokupan', "Failed to initialize plugin", { error: err });
            throw err;
        }
        return this;
    }

    /**
     * Registers a callback to be executed before the server starts listening.
     */
    public onStart(callback: () => Promise<void> | void) {
        this.startupHooks.push(callback);
        return this;
    }

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
    /**
     * Prepare the application for listening.
     * Use this if you want to initialize the app without starting the server immediately.
     */
    public async start() {
        // Run startup hooks
        await Promise.all(this.startupHooks.map(hook => hook()));// --- Dev Mode Auto-Enablers ---
        if (this.applicationConfig.development) {
            this.logger?.info('Shokupan', 'Development mode enabled. Auto-loading development plugins...');

            // Always ensure middleware tracking is on in dev unless explicitly disabled
            if (this.applicationConfig.enableMiddlewareTracking !== false) {
                this.applicationConfig.enableMiddlewareTracking = true;
                this.logger.info("Shokupan", "Enabled middleware tracking");
            }

            // Register ErrorView
            const hasErrorView = (this as any).plugins?.some((p: any) => p instanceof ErrorView);
            if (!hasErrorView) {
                await this.register(new ErrorView({
                    developmentErrorView: true
                }));
                this.logger.info("Shokupan", "Loaded ErrorView module");
            }

            // Register Dashboard
            const hasDashboard = (this as any).plugins?.some((p: any) => typeof p === 'object' && p.metadata?.pluginName === 'Dashboard');
            if (!hasDashboard) {
                await this.register(DashboardPlugin({
                    path: '/dashboard',
                    trackStateMutations: true
                }));
                this.logger.info("Shokupan", "Loaded Dashboard module");
            }

            // Register ApiExplorer
            const hasApiExplorer = (this as any).plugins?.some((p: any) => p === ApiExplorerPlugin || p instanceof ApiExplorerPlugin);
            if (!hasApiExplorer) {
                await this.register(new ApiExplorerPlugin(), { path: '/dashboard/explorer' });
                this.logger.info("Shokupan", "Loaded ApiExplorer module");
            }

            // Register AsyncAPI UI
            const hasAsyncApi = (this as any).plugins?.some((p: any) => p === AsyncApiPlugin || p instanceof AsyncApiPlugin);
            if (!hasAsyncApi) {
                await this.register(new AsyncApiPlugin(), { path: '/dashboard/ws-explorer' });
                this.logger.info("Shokupan", "Loaded AsyncAPI module");
            }
        }


        if (this.applicationConfig.enableOpenApiGen) {
            // --- Well-Known Files Implementation ---

            // 1. .well-known/openapi.yaml
            this.get("/.well-known/openapi.yaml", async (ctx) => {
                try {
                    // Wait for spec if not ready yet
                    await this.openApiSpecPromise;
                    const { dump } = await import('js-yaml');
                    const yaml = dump(this.openApiSpec);
                    return ctx.send(yaml, { status: 200, headers: { 'content-type': 'application/yaml' } });
                } catch (e) {
                    this.logger?.error('Shokupan', "Failed to generate OpenAPI YAML", { error: e });
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
                            url: `${this.applicationConfig.hostname === 'localhost' ? 'http' : 'https'}://${this.applicationConfig.hostname}:${this.applicationConfig.port}/.well-known/openapi.yaml`,
                            is_user_authenticated: false
                        },
                        logo_url: config.logo_url || `${this.applicationConfig.hostname === 'localhost' ? 'http' : 'https'}://${this.applicationConfig.hostname}:${this.applicationConfig.port}/logo.png`, // Placeholder default
                        contact_email: config.contact_email || pkg.author?.email || "support@example.com",
                        legal_info_url: config.legal_info_url || `${this.applicationConfig.hostname === 'localhost' ? 'http' : 'https'}://${this.applicationConfig.hostname}:${this.applicationConfig.port}/legal`
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
                                url: `${this.applicationConfig.hostname === 'localhost' ? 'http' : 'https'}://${this.applicationConfig.hostname}:${this.applicationConfig.port}/`,
                                spec_url: `${this.applicationConfig.hostname === 'localhost' ? 'http' : 'https'}://${this.applicationConfig.hostname}:${this.applicationConfig.port}/.well-known/openapi.yaml`
                            }
                        ]
                    };
                    return ctx.json(catalog);
                });
            }

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

            // Run spec available hooks (either now after blocking, or later after async completion)
            if (shouldBlock) {
                await Promise.all(this.specAvailableHooks.map(hook => hook(this.openApiSpec)));
            } else {
                // Run hooks after async generation completes
                this.openApiSpecPromise.then(spec => {
                    return Promise.all(this.specAvailableHooks.map(hook => hook(spec)));
                }).catch(err => {
                    this.logger?.error('Shokupan', "Error running spec available hooks", { error: err });
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



        if (this.applicationConfig.autoBackpressureFeedback === true) {
            this.cpuMonitor = new SystemCpuMonitor();
            this.cpuMonitor.start();
        }
    }

    /**
     * Starts the application server.
     * 
     * @param port - The port to listen on. If not specified, the port from the configuration is used. If that is not specified, port 3000 is used.
     * @returns The server instance.
     */
    public async listen(port?: number) {
        this.httpServer = new ShokupanServer(this);
        this.server = await this.httpServer.listen(port);

        const protocol = (this.applicationConfig.tls || this.applicationConfig.development) ? 'https' : 'http';
        const url = `${protocol}://${this.applicationConfig.hostname}:${this.applicationConfig.port}`;
        const hyperlinkedUrl = `\x1b]8;;${url}\x07${url}\x1b]8;;\x07`;

        this.logger.info('Shokupan', `Server running on ${hyperlinkedUrl}`);
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
        if (this.httpServer !== undefined) {
            await this.httpServer.stop(closeActiveConnections);
        } else if (this.server?.stop) {
            // Fallback
            await this.server.stop(closeActiveConnections);
        }
        this.server = undefined;

        await Container.teardown();
    }

    public [$dispatch](req: ShokupanRequest<T>) {
        return this.fetch(req as unknown as Request);
    }

    /**
     * Processes a request by wrapping the standard fetch method.
     */
    public override async testRequest(options: RequestOptions): Promise<ProcessResult> {
        if (!this.rootTrie) {
            this.compile();
        }

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
        const reqBody = options.body && typeof options.body === "object" ? JSON.stringify(options.body) : options.body;
        const reqHeaders = new Headers(options.headers as any);
        if (typeof options.body === "object" && !reqHeaders.has("content-type")) {
            reqHeaders.set("content-type", "application/json");
        }

        const req = new ShokupanRequest({
            method: (options.method || "GET") as Method,
            url,
            headers: reqHeaders,
            body: reqBody
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
            // Dynamic import to avoid hard dependency
            const { trace, context } = await import('@opentelemetry/api');
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
            const requestId = this.applicationConfig.idGenerator?.() ?? nanoid();
            const ctxStore = new RequestContextStore();
            ctxStore.request = req;
            ctxStore['requestId'] = requestId;
            ctxStore['app'] = this;
            return asyncContext.run(ctxStore, () => this.handleRequest(req, server, requestId));
        }

        return this.handleRequest(req, server);
    }

    private async handleRequest(req: Request, server?: Server<any>, requestId?: string): Promise<Response> {
        // Cast to ShokupanRequest if needed, though at runtime it's just a Request
        // But ShokupanContext expects ShokupanRequest.
        const request = req as unknown as ShokupanRequest<T>;

        const controller = new AbortController();
        const ctx = new ShokupanContext<T>(request, server, undefined, this, controller.signal, this.applicationConfig.enableMiddlewareTracking, requestId);

        const handle = async () => {

            // Auto-Backpressure Check
            if (this.cpuMonitor && this.cpuMonitor.getUsage() > (this.applicationConfig.autoBackpressureLevel ?? 60)) {
                // Return 429 immediately
                const msg = "Too Many Requests (CPU Backpressure)";
                const res = ctx.text(msg, 429);
                // Trigger hooks so metrics are recorded
                if (this.hasOnResponseEndHook) await this.runHooks('onResponseEnd', ctx, res);
                return res;
            }

            try {
                // Request Start Hook
                if (this.hasOnRequestStartHook) await this.runHooks('onRequestStart', ctx);

                // Compose middleware + router dispatch
                const fn = this.composedMiddleware ??= compose(this.middleware);

                // Object.defineProperty(fn, 'name', { value: "middleware chain", configurable: false });

                // The "next" at the end of the middleware chain is the router dispatch
                const result = await fn(ctx, async () => {

                    // Start body parsing early for applicable HTTP methods to overlap with route lookup
                    let bodyParsing: Promise<void> | undefined;
                    if (req.method !== 'GET' && req.method !== 'HEAD') {
                        // For POST/PUT/PATCH/DELETE, start parsing
                        bodyParsing = ctx.parseBody();
                    }

                    const match = this.find(req.method, ctx.path);


                    if (match) {
                        ctx[$routeMatched] = true;
                        ctx.params = match.params;

                        // Ensure body is parsed before handler executes
                        if (bodyParsing) await bodyParsing;

                        // --- Manual Tracking for Route Handler ---
                        if (this.applicationConfig.enableMiddlewareTracking) {
                            const handler = match.handler;
                            const meta = (handler as any).metadata;

                            if (meta) {
                                const trackingStartTime = performance.now();
                                const handlerName = meta.name || handler.name || 'anonymous';

                                ctx.handlerStack.push({
                                    name: handlerName,
                                    file: meta.file,
                                    line: meta.line,
                                    isBuiltin: meta.isBuiltin,
                                    startTime: trackingStartTime,
                                    duration: -1
                                });

                                try {
                                    const res = await handler(ctx);

                                    const duration = performance.now() - trackingStartTime;
                                    const stackItem = ctx.handlerStack[ctx.handlerStack.length - 1];
                                    if (stackItem) stackItem.duration = duration;

                                    Promise.resolve().then(async () => {
                                        try {
                                            const db = this.db;
                                            if (!db) return;

                                            const timestamp = Date.now();
                                            await db.upsert('middleware_tracking', JSON.stringify({
                                                timestamp,
                                                name: handlerName
                                            }), {
                                                name: handlerName,
                                                path: ctx.path,
                                                timestamp,
                                                duration,
                                                file: meta.file,
                                                line: meta.line,
                                                error: undefined,
                                                metadata: {
                                                    isBuiltin: meta.isBuiltin,
                                                    pluginName: meta.pluginName
                                                }
                                            });
                                        } catch (e) { }
                                    });

                                    return res;
                                } catch (err) {
                                    const duration = performance.now() - trackingStartTime;
                                    const stackItem = ctx.handlerStack[ctx.handlerStack.length - 1];
                                    if (stackItem) stackItem.duration = duration;

                                    Promise.resolve().then(async () => {
                                        try {
                                            const db = this.db;
                                            if (!db) return;

                                            const timestamp = Date.now();
                                            await db.upsert('middleware_tracking', JSON.stringify({
                                                timestamp,
                                                name: handlerName
                                            }), {
                                                name: handlerName,
                                                path: ctx.path,
                                                timestamp,
                                                duration,
                                                file: meta.file,
                                                line: meta.line,
                                                error: String(err),
                                                metadata: {
                                                    isBuiltin: meta.isBuiltin,
                                                    pluginName: meta.pluginName
                                                }
                                            });
                                        } catch (e) { }
                                    });
                                    throw err;
                                }
                            }
                        }

                        return match.handler(ctx);
                    }

                    // No fallback auto-upgrade - WebSocket routes must be explicitly defined

                    // No route matched - return 404 Not Found
                    // Exception: If middleware manually changed the status from default 200,
                    // respect that (e.g., auth middleware set 401)
                    if (ctx.response.status !== HTTP_STATUS.OK) {
                        return ctx.send(null, { status: ctx.response.status, headers: ctx.response.headers });
                    }

                    throw new NotFoundError();
                });

                let response: Response | Promise<Response>;

                if (ctx.isUpgraded) {
                    response = undefined as unknown as Response;
                }
                else if (result instanceof Response) {
                    response = result;
                }
                // Check explicit void return but response set in context
                else if ((result === null || result === undefined) && ctx[$finalResponse] instanceof Response) {
                    response = ctx[$finalResponse];
                }
                else if (result === null || result === undefined) {
                    // Handler returned nothing (void/null/undefined)

                    if (ctx[$finalResponse] instanceof Response) {
                        response = ctx[$finalResponse];
                    }
                    else if (ctx.isUpgraded) {
                        // Request was successfully upgraded to WebSocket
                        return undefined as unknown as Response;
                    }
                    else if (ctx[$routeMatched]) {
                        // A route WAS matched but returned nothing.
                        // Default to 204 No Content (unless user set status manually via ctx.response.status)
                        let status = ctx.response.status;
                        if (status === HTTP_STATUS.OK) {
                            status = HTTP_STATUS.NO_CONTENT;
                        }
                        // We send an empty response with the determined status
                        response = ctx.send(null, { status, headers: ctx.response.headers });
                    } else {
                        // Should have been thrown inside the middleware chain
                        throw new NotFoundError();
                    }
                }
                else if (typeof result === "object") {
                    response = ctx.json(result);
                }
                else {
                    response = ctx.text(String(result));
                }

                // Request End Hook - Processing finished, response ready
                if (this.hasOnRequestEndHook) await this.runHooks('onRequestEnd', ctx);

                if (response instanceof Promise) {
                    response = await response;
                }

                // Response Start Hook - About to send response
                if (this.hasOnResponseStartHook) await this.runHooks('onResponseStart', ctx, response);

                return response;

            }
            catch (err: any) {
                const span = asyncContext.getStore()?.span;
                if (span) span.setStatus({ code: 2 }); // Error

                // Check for registered error handlers
                for (let i = 0; i < this.errorHandlers.length; i++) {
                    const { type, handler } = this.errorHandlers[i];
                    if (err instanceof type) {
                        try {
                            const result = await handler(err, ctx);
                            // Response Start Hook - About to send response
                            if (this.hasOnResponseStartHook) await this.runHooks('onResponseStart', ctx, result);
                            return result;
                        } catch (handlerErr) {
                            // If the error handler itself fails, fall through to default handling
                            // but log the new error
                            if (process.env.NODE_ENV !== 'test') this.logger?.error("Shokupan", "Error in error handler:", { error: handlerErr });
                            err = handlerErr;
                            break; // Avoid infinite loops if handlerErr is same type
                        }
                    }
                }

                // Extract status from error object (supports both .status and .statusCode)
                let status = getErrorStatus(err);

                // Handle JSON Parse errors specifically
                if (err instanceof SyntaxError && err.message.includes('JSON')) {
                    status = 400;
                }

                // Mask error details in production
                const isDev = this.applicationConfig.development !== false;
                const message = isDev ? (err.message || "Internal Server Error") : "Internal Server Error";

                const body: any = { error: message };
                if (isDev && err.errors) body.errors = err.errors;
                if (isDev && err.stack) body.stack = err.stack;

                // Error Hook
                if (this.hasOnErrorHook) await this.runHooks('onError', ctx, err);

                return ctx.json(body, status);
            }
        };

        // Timeout Logic
        let executionPromise = handle();
        const timeoutMs = this.applicationConfig.requestTimeout;

        if (timeoutMs && timeoutMs > 0) {
            let timeoutId: ReturnType<typeof setTimeout>;

            const timeoutPromise = new Promise<never>((_, reject) => {
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
                this.logger?.error("Shokupan", "Unexpected error in request execution:", { error: err });
                return ctx.text("Internal Server Error", HTTP_STATUS.INTERNAL_SERVER_ERROR);
            })
            .then(async (res) => {
                // Response End Hook - Response returned
                // Note: We can't guarantee it's fully sent to client here, but it's handed off to Bun
                await this.runHooks('onResponseEnd', ctx, res);
                return res;
            });
    };

    /**
     * Compiles all routes into a master Trie for O(1) router lookup.
     * Use this if adding routes dynamically after start (not recommended but possible).
     */
    public compile() {
        this.rootTrie = new RouterTrie<T>();
        this.flattenRoutes(this.rootTrie, this, "", []);
        // Trigger generic instrumentation?
    }

    private flattenRoutes(
        trie: RouterTrie<T>,
        router: ShokupanRouter<T>,
        prefix: string,
        middlewareStack: Middleware[]
    ) {
        // 1. Determine Stack for this level
        // If router is THIS (application), we do NOT add its middleware to the stack
        // because it is already executed globally in handleRequest.
        // If router is a child, we MUST add its middleware.
        let effectiveStack = middlewareStack;
        if (router !== this as any) {
            effectiveStack = [...middlewareStack, ...router.middleware];
        }

        // Helper to join paths correctly, ensuring no double slashes or accidental trailing slashes
        const joinPath = (base: string, segment: string) => {
            let b = base;
            // Normalize base: remove trailing slash unless it's root
            if (b !== '/' && b.endsWith('/')) {
                b = b.slice(0, -1);
            }

            let s = segment;

            // For root segment, return base directly (no trailing slash)
            if (s === '/') {
                return b;
            }

            if (s === '') {
                return b;
            }

            // Ensure separator
            if (!s.startsWith('/')) {
                s = '/' + s;
            }

            // If base is root '/', return s directly (s starts with /)
            if (b === '/') {
                return s;
            }

            return b + s;
        };

        // 2. Add local routes
        for (const route of router[$routes]) {
            const fullPath = joinPath(prefix, route.path);

            // Wrap Handler with Middleware Stack
            let handler = route.bakedHandler || route.handler;
            if (effectiveStack.length > 0) {
                const fn = compose(effectiveStack);
                const originalHandler = handler;
                handler = async (ctx) => {
                    // Middleware stack needs "next" to proceed to handler
                    // Handler is the terminal "next"
                    return fn(ctx, () => originalHandler(ctx));
                };
                // Preserve metadata if any
                (handler as any).originalHandler = (originalHandler as any).originalHandler || originalHandler;
            }

            trie.insert(route.method, fullPath, handler);

            // Handle Trailing Slash Ambiguity for Root Routes
            // If the route is effectively the "index" of the mount point (e.g. /docs or /asyncapi),
            // we register BOTH /docs and /docs/ to ensure maximum compatibility.
            if ((route.path === '/' || route.path === '') && fullPath !== '/') {
                trie.insert(route.method, fullPath + '/', handler);
            }
        }

        // 3. Recurse children
        for (const child of router[$childRouters]) {
            const mountPath = child[$mountPath];
            const childPrefix = joinPath(prefix, mountPath);
            this.flattenRoutes(trie, child, childPrefix, effectiveStack);
        }
    }

    public override find(method: string, path: string) {
        if (this.rootTrie) {
            const result = this.rootTrie.search(method, path);
            if (result) return result;

            // Fallback HEAD -> GET
            if (method === "HEAD") {
                return this.rootTrie.search("GET", path);
            }
            return null;
        }
        return super.find(method, path);
    }
}
