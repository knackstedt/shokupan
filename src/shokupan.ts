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
import { getProcess, getProcessEnv } from './util/env';
import { getErrorStatus, NotFoundError } from "./util/http-error";
import { HTTP_STATUS } from "./util/http-status";
import { configureIde } from './util/ide';
import { createHTTPLogger, createLogger } from './util/logger';

import { Container } from './decorators';
import { getCallerInfo } from './decorators/util/stack';
import { MiddlewareTracker } from './util/middleware-tracker';
import { enablePromisePatch, kContext } from './util/promise';
import { ShokupanRequest } from './util/request';
import { type ResponseTransformer, ResponseTransformerRegistry } from './util/response-transformer';
import { $appRoot, $childRouters, $dispatch, $finalResponse, $isApplication, $mountPath, $routeMatched, $routes } from './util/symbol';
import { RouterTrie } from './util/trie';
import type { ErrorHandler, GlobalShokupanState, Method, Middleware, ProcessResult, RequestOptions, ShokupanConfig, ShokupanHooks, ShokupanPlugin, ShokupanRoute } from './util/types';


const defaults: ShokupanConfig = {
    port: 3000,
    hostname: "localhost",
    development: getProcessEnv('NODE_ENV') !== "production",
    enableAsyncLocalStorage: false,
    enableHTTPBridge: false,
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
export class Shokupan<T extends Record<string, any> = GlobalShokupanState> extends ShokupanRouter<T> {
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
    private plugins: ShokupanPlugin[] = [];
    private specAvailableHooks: ((spec: any) => void | Promise<void>)[] = [];

    private pluginInitPromises: Promise<void>[] = [];
    private securityHeadersPromise?: Promise<void>;


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
        super(routerConfig);

        this[$isApplication] = true;
        this[$appRoot] = this;
        this.applicationConfig = config;

        // Register hooks if provided in config
        if (hooks) {
            for (const [name, fn] of Object.entries(hooks) as [keyof ShokupanHooks<T>, any][]) {
                this.hook(name, fn);
            }
        }

        // Initialize logger if not provided
        this.applicationConfig.logger ??= createLogger();

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

        // Security: Apply default security headers (deferred via dynamic import)
        if (this.applicationConfig.defaultSecurityHeaders) {
            this.securityHeadersPromise = (async () => {
                const { SecurityHeaders } = await import("./plugins/middleware/security-headers");
                this.use(SecurityHeaders(this.applicationConfig.defaultSecurityHeaders === true ? {} : this.applicationConfig.defaultSecurityHeaders));
            })();
        }

        this.dbPromise = Promise.resolve();
        if (this.applicationConfig.adapter !== 'wintercg' && this.applicationConfig.datastore) {
            this.dbPromise = this.initDatastore().catch(err => {
                // Log but don't crash if optional datastore init fails
                this.logger?.debug('Shokupan', "Failed to initialize default datastore", { error: err });
                throw err; // Re-throw so callers know it failed
            });
        }

        if (this.applicationConfig.enablePromiseMonkeypatch) {
            enablePromisePatch();

            // Register global handler for unhandled rejections to log with context
            // We use process.prependListener if available to try to catch it before others, 
            // or just on() 
            // Note: In Bun, unhandledRejection might behave slightly differently than Node.
            const processRef = getProcess();
            if (processRef && processRef.on) {
                processRef.on('unhandledRejection', (reason: any, promise: any) => {
                    const ctx = promise?.[kContext];
                    // Check if this promise belongs to this app's context
                    if (ctx && ctx.store && ctx.store.app === this) {
                        const { requestId } = ctx.store;
                        this.logger?.error('Shokupan', "Unhandled Rejection in Shokupan Request", {
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
                    this.datastore = new SurrealAdapter(options);
                    break;
                }
                default: {
                    // Determine default behavior if adapter not specified
                    // Old default: SurrealDB
                    const { SurrealAdapter } = await import('./util/adapter/datastore/surreal');
                    this.datastore = new SurrealAdapter(options || {});
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
     *
     * Supports Express-style path-based middleware:
     * `use('/admin', middleware)` runs only for routes under `/admin`.
     */
    public override use(middleware: Middleware): this;
    public override use(path: string, middleware: Middleware): this;
    public override use(
        arg1: string | Middleware,
        arg2?: Middleware
    ) {
        let path: string | undefined;
        let middleware: Middleware;

        if (typeof arg1 === 'string') {
            path = arg1;
            middleware = arg2 as Middleware;
        } else {
            middleware = arg1;
        }

        if (typeof middleware !== 'function') {
            throw new TypeError(
                `[Shokupan] app.use() expects a function as middleware, received ${typeof middleware}. ` +
                `Did you mean to pass a path string as the first argument? Use use('/path', middleware) for path-based middleware.`
            );
        }

        // --- Middleware Tracking Logic ---
        const { file, line } = getCallerInfo();

        const wrapped = MiddlewareTracker.wrap(middleware, {
            file,
            line,
            name: middleware.name || 'middleware',
            isBuiltin: middleware.isBuiltin,
            pluginName: middleware.pluginName
        });

        if (this.applicationConfig.enableMiddlewareTracking) {
            wrapped.order = this.middleware.length;
        }

        // Delegate to router's use with path support
        if (path) {
            super.use(path, this.applicationConfig.enableMiddlewareTracking ? wrapped : middleware);
        } else {
            this.middleware.push(this.applicationConfig.enableMiddlewareTracking ? wrapped : middleware);
        }

        // Invalidate composed middleware cache so the next request picks up the new middleware
        this.composedMiddleware = undefined;

        return this;
    }

    /**
     * Registers a plugin.
     * This returns a promise that resolves when the plugin is initialized. You do not 
     * need to await it unless you want to run code specifically after the plugin is initialized.
     * Shokupan automatically awaits plugin initialization promises when calling listen().
     */
    public async register(plugin: ShokupanPlugin, options?: { path?: string; }) {
        this.plugins.push(plugin);
        try {
            const promise = plugin.onInit(this, options);
            this.pluginInitPromises.push(Promise.resolve(promise));
            await promise;
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

            this.use(createHTTPLogger());

            // Always ensure middleware tracking is on in dev unless explicitly disabled
            if (this.applicationConfig.enableMiddlewareTracking !== false) {
                this.applicationConfig.enableMiddlewareTracking = true;
                this.logger?.info("Shokupan", "Enabled middleware tracking");
            }

            // Register ErrorView
            const hasErrorView = this.plugins.some((p: any) => p instanceof ErrorView);
            if (!hasErrorView) {
                try {
                    await this.register(new ErrorView({
                        developmentErrorView: true
                    }));
                    this.logger?.info("Shokupan", "Loaded ErrorView module");
                } catch (err: any) {
                    this.logger?.warn("Shokupan", "ErrorView plugin failed to load", { error: err.message });
                }
            }

            // Register Dashboard
            const hasDashboard = this.plugins.some((p: any) => typeof p === 'object' && p.metadata?.pluginName === 'Dashboard');
            if (!hasDashboard) {
                try {
                    await this.register(DashboardPlugin({
                        path: '/dashboard',
                        trackStateMutations: true
                    }));
                    this.logger?.info("Shokupan", "Loaded Dashboard module");
                } catch (err: any) {
                    this.logger?.warn("Shokupan", "Dashboard plugin failed to load", { error: err.message });
                }
            }

            // Register ApiExplorer
            const hasApiExplorer = this.plugins.some((p: any) => p === ApiExplorerPlugin || p instanceof ApiExplorerPlugin);
            if (!hasApiExplorer) {
                try {
                    await this.register(new ApiExplorerPlugin(), { path: '/dashboard/explorer' });
                    this.logger?.info("Shokupan", "Loaded ApiExplorer module");
                } catch (err: any) {
                    this.logger?.warn("Shokupan", "ApiExplorer plugin failed to load", { error: err.message });
                }
            }

            // Register AsyncAPI UI
            const hasAsyncApi = this.plugins.some((p: any) => p === AsyncApiPlugin || p instanceof AsyncApiPlugin);
            if (!hasAsyncApi) {
                try {
                    await this.register(new AsyncApiPlugin(), { path: '/dashboard/ws-explorer' });
                    this.logger?.info("Shokupan", "Loaded AsyncAPI module");
                } catch (err: any) {
                    this.logger?.warn("Shokupan", "AsyncAPI plugin failed to load", { error: err.message });
                }
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
                } catch (e: any) {
                    if (e.code === 'ERR_MODULE_NOT_FOUND' || e.message?.includes("Cannot find package 'js-yaml'")) {
                        this.logger?.error('Shokupan', "OpenAPI YAML generation failed: js-yaml is not installed. Run `bun add js-yaml` to enable YAML output.", { error: e });
                        return ctx.text("OpenAPI YAML generation failed: js-yaml is not installed. Run `bun add js-yaml` to enable YAML output.", 500);
                    }
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
    public async listen(port?: number, callback?: () => void) {
        this.httpServer = new ShokupanServer(this);

        // Wait for all plugins to initialize
        await Promise.allSettled(this.pluginInitPromises);

        this.server = await this.httpServer.listen(port);

        const protocol = (this.applicationConfig.tls || this.applicationConfig.development) ? 'https' : 'http';
        const url = `${protocol}://${this.applicationConfig.hostname}:${this.applicationConfig.port}`;
        const hyperlinkedUrl = `\x1b]8;;${url}\x07${url}\x1b]8;;\x07`;

        this.logger?.info('Shokupan', `Server running on ${hyperlinkedUrl}`);
        callback?.();
        return this.server;
    }


    /**
     * Stops the application server.
     * 
     * This method gracefully shuts down the server and stops any running monitors.
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
        await this.runOnStopHooks(this);

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
        return this.fetch(req);
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
        const reqHeaders = options.headers ? new Headers(options.headers) : new Headers();
        if (typeof options.body === "object" && !reqHeaders.has("content-type")) {
            reqHeaders.set("content-type", "application/json");
        }

        const req = new ShokupanRequest<T>({
            method: (options.method || "GET") as Method,
            url,
            headers: reqHeaders,
            body: reqBody
        });

        const res = await this.fetch(req);

        // Convert Response to ProcessResult
        const status = res!.status;
        const headers: Record<string, string> = {};
        res!.headers.forEach((v, k) => headers[k] = v);

        let data: any;
        if (headers['content-type']?.includes('application/json')) {
            data = await res!.json();
        }
        else {
            data = await res!.text();
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
    public async fetch(req: Request | ShokupanRequest<any>, server?: Server<any>): Promise<Response | undefined> {
        // Await lazy-loaded security headers middleware before first request
        if (this.securityHeadersPromise) {
            await this.securityHeadersPromise;
            this.securityHeadersPromise = undefined;
        }

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
            return tracer.startActiveSpan(`${req.method} ${new URL(req.url).pathname}`, attrs, ctx || context.active(), span => {
                const ctxStore = new RequestContextStore();
                ctxStore.span = span;
                // Don't store the Request object - it prevents GC and causes memory leaks
                // ctxStore.request = req;

                return asyncContext.run(ctxStore, () => this.handleRequest(req, server).finally(() => span.end()));
            });
        }

        // If ALS is enabled but tracing is not
        if (this.applicationConfig.enableAsyncLocalStorage) {
            const requestId = this.applicationConfig.idGenerator?.() ?? nanoid();
            const ctxStore = new RequestContextStore();
            // Don't store the Request object - it prevents GC and causes memory leaks
            // ctxStore.request = req;
            ctxStore['requestId'] = requestId;
            ctxStore['app'] = this;
            return asyncContext.run(ctxStore, () => this.handleRequest(req, server, requestId));
        }

        return this.handleRequest(req, server);
    }

    private async handleRequest(req: Request | ShokupanRequest<T>, server?: Server<any>, requestId?: string): Promise<Response | undefined> {
        const request = req as ShokupanRequest<T>;

        const controller = this.applicationConfig.enableAbortController ? new AbortController() : undefined;
        const ctx = new ShokupanContext<T>(request, server, undefined, this, controller?.signal, this.applicationConfig.enableMiddlewareTracking, requestId);

        const handle = async () => {

            // Auto-Backpressure Check
            if (this.cpuMonitor && this.cpuMonitor.getUsage() > (this.applicationConfig.autoBackpressureLevel ?? 60)) {
                // Return 429 immediately
                const msg = "Too Many Requests (CPU Backpressure)";
                const res = ctx.text(msg, 429);
                // Trigger hooks so metrics are recorded
                if (this.hasOnResponseEndHook) {
                    Promise.resolve(this.runHooks('onResponseEnd', ctx, res)).catch(e => {
                        this.logger?.debug("Shokupan", "Error in onResponseEnd hook (backpressure):", { error: e });
                    });
                }
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
                        // Security: reject chunked requests that bypass Content-Length size checks
                        if (req.headers.get('transfer-encoding')?.includes('chunked') && !this.applicationConfig.allowChunkedBody) {
                            throw Object.assign(new Error("Chunked Transfer-Encoding Not Allowed"), { status: 411 });
                        }
                        // For POST/PUT/PATCH/DELETE, start parsing
                        bodyParsing = ctx.parseBody();
                    }

                    const match = this.find(req.method, ctx.path);


                    if (match) {
                        ctx[$routeMatched] = true;
                        ctx.params = match.params;
                        ctx.matchedRoute = match.route;

                        // Ensure body is parsed before handler executes
                        if (bodyParsing) await bodyParsing;

                        // --- Manual Tracking for Route Handler ---
                        if (this.applicationConfig.enableMiddlewareTracking) {
                            const handler = match.handler;
                            const meta = (handler as Middleware).metadata;

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
                        return ctx.send(undefined, { status: ctx.response.status, headers: ctx.response.headers });
                    }

                    throw new NotFoundError();
                });

                let response: Response | undefined;

                if (ctx.isUpgraded) {
                    response = undefined;
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
                        // Request was successfully upgraded to WebSocket.
                        // Manually fire onResponseEnd here BEFORE returning so the
                        // dashboard can log the WS connection — Bun needs us to
                        // return undefined from the fetch handler immediately for WS.
                        if (this.hasOnResponseEndHook) {
                            Promise.resolve(this.runHooks('onResponseEnd', ctx, undefined)).catch(e => {
                                this.logger?.debug("Shokupan", "Error in onResponseEnd hook (ws):", { error: e });
                            });
                        }
                        return undefined;
                    }
                    else if (ctx[$routeMatched]) {
                        // A route WAS matched but returned nothing.
                        // Default to 204 No Content (unless user set status manually via ctx.response.status)
                        let status = ctx.response.status;
                        if (status === HTTP_STATUS.OK) {
                            status = HTTP_STATUS.NO_CONTENT;
                        }
                        // We send an empty response with the determined status
                        response = ctx.send(undefined, { status, headers: ctx.response.headers });
                    } else {
                        // Should have been thrown inside the middleware chain
                        throw new NotFoundError();
                    }
                }
                else if (typeof result === "object") {
                    response = await ctx.json(result);
                }
                else {
                    response = await ctx.text(String(result));
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
                const seenHandlers = new Set<number>();
                let currentErr = err;
                for (let i = 0; i < this.errorHandlers.length; i++) {
                    if (seenHandlers.has(i)) continue;
                    const { type, handler } = this.errorHandlers[i];
                    if (currentErr instanceof type) {
                        seenHandlers.add(i);
                        try {
                            const result = await handler(currentErr, ctx);
                            // Response Start Hook - About to send response
                            if (this.hasOnResponseStartHook) await this.runHooks('onResponseStart', ctx, result);
                            return result;
                        } catch (handlerErr) {
                            // If the error handler itself fails, try subsequent handlers with the new error,
                            // but track seen handlers to prevent infinite loops.
                            if (getProcessEnv('NODE_ENV') !== 'test') this.logger?.error("Shokupan", "Error in error handler:", { error: handlerErr });
                            currentErr = handlerErr;
                            i = -1; // Restart loop from beginning to find a handler for the new error
                        }
                    }
                }
                // Extract status from error object (supports both .status and .statusCode)
                let status = getErrorStatus(currentErr);

                // Handle JSON Parse errors specifically
                if (currentErr instanceof SyntaxError && currentErr.message.includes('JSON')) {
                    status = 400;
                }

                // Mask error details in production
                const isDev = this.applicationConfig.development === true;
                const message = isDev ? (currentErr.message || "Internal Server Error") : "Internal Server Error";

                const body: any = { error: message };
                if (isDev && currentErr.errors) body.errors = currentErr.errors;
                if (isDev && currentErr.stack) body.stack = currentErr.stack;

                // Error Hook
                if (this.hasOnErrorHook) await this.runHooks('onError', ctx, currentErr);

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
                    controller?.abort(); // Signal cancellation to handlers
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
                // Note: We can't guarantee it's fully sent to client here, but it's handed off to Bun
                if (this.hasOnResponseEndHook) {
                    Promise.resolve(this.runHooks('onResponseEnd', ctx, res)).catch(e => {
                        this.logger?.debug("Shokupan", "Error in onResponseEnd hook:", { error: e });
                    });
                }
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
        if (router !== this) {
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
                handler.originalHandler = originalHandler.originalHandler || originalHandler;
                (handler as { _route?: ShokupanRoute })._route = (originalHandler as { _route?: ShokupanRoute })._route;
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
            if (result) {
                const route = (result.handler as { _route?: ShokupanRoute })._route;
                return { ...result, route };
            }

            // Fallback HEAD -> GET
            if (method === "HEAD") {
                const headResult = this.rootTrie.search("GET", path);
                if (headResult) {
                    const route = (headResult.handler as { _route?: ShokupanRoute })._route;
                    return { ...headResult, route };
                }
            }
            return null;
        }
        return super.find(method, path);
    }
}
