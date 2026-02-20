import { ShokupanContext } from './context';
import { getCallerInfo } from './decorators/util/stack';
import {
    getCloseHandler,
    getErrorHandler,
    getEventHandlers,
    getEventMiddlewareHandler,
    getMessageHandler,
    getOpenHandler,
    getUpgradeHandler,
    isWebSocketController
} from './decorators/websocket';
import { compose } from './middleware';
import { generateOpenApi } from './plugins/application/openapi/openapi';
import { serveStatic } from './plugins/middleware/serve-static';
import type { Shokupan } from './shokupan';
import { ControllerScanner } from './util/controller-scanner';
import { getErrorStatus } from './util/http-error';
import { HTTP_STATUS } from './util/http-status';
import { McpProtocol, type McpPrompt } from './util/mcp-protocol';
import { MiddlewareTracker } from './util/middleware-tracker';
import { ShokupanRequest } from './util/request';
import { $appRoot, $childControllers, $childRouters, $debug, $dispatch, $isApplication, $isMounted, $isRouter, $mountPath, $onWsMessage, $parent, $routeSpec, $routes, $ws, $wsMessages } from './util/symbol';
import { RouterTrie } from './util/trie';
import { type GuardAPISpec, type HeadersInit, type JSXRenderer, type Method, type MethodAPISpec, type Middleware, type OpenAPIOptions, type ProcessResult, type RequestOptions, type RouteMetadata, type RouteParams, type ShokupanController, type ShokupanHandler, type ShokupanHooks, type ShokupanRoute, type ShokupanRouteConfig, type StaticServeOptions } from './util/types';
import { ShokupanWebsocketRouter } from './websocket';


export const RouterRegistry = new Map<string, ShokupanRouter<any>>();

export const ShokupanApplicationTree = {};

/**
 * Shokupan Router
 * 
 * A router for organizing and grouping routes with shared middleware and configuration.
 * 
 * @template State - The shape of `ctx.state` for all routes in this router.
 * Provides type safety for state management within the router's middleware and handlers.
 * 
 * @example Basic Router
 * ```typescript
 * const router = new ShokupanRouter();
 * router.get('/users', (ctx) => ctx.json({ users: [] }));
 * 
 * app.mount('/api', router);
 * // Routes: GET /api/users
 * ```
 * 
 * @example Typed State Router
 * ```typescript
 * interface AuthState {
 *   userId: string;
 *   isAuthenticated: boolean;
 * }
 * 
 * class AuthRouter extends ShokupanRouter<AuthState> {
 *   constructor() {
 *     super();
 *     
 *     // Router middleware has typed state
 *     this.use((ctx, next) => {
 *       ctx.state.userId = 'user-123';
 *       ctx.state.isAuthenticated = true;
 *       return next();
 *     });
 *     
 *     this.get('/me', (ctx) => {
 *       // State is fully typed
 *       return ctx.json({ userId: ctx.state.userId });
 *     });
 *   }
 * }
 * 
 * app.mount('/auth', new AuthRouter());
 * ```
 * 
 * @example Router with Middleware
 * ```typescript
 * const apiRouter = new ShokupanRouter();
 * 
 * // Router-level middleware
 * apiRouter.use(async (ctx, next) => {
 *   console.log(`API request: ${ctx.method} ${ctx.path}`);
 *   return next();
 * });
 * 
 * apiRouter.get('/status', (ctx) => ctx.json({ status: 'ok' }));
 * app.mount('/api', apiRouter);
 * ```
 */
export class ShokupanRouter<T extends Record<string, any> = Record<string, any>> {
    // Internal marker to identify Router vs. Application
    private [$isApplication]: boolean = false;
    private [$isMounted]: boolean = false;
    private [$isRouter]: true = true;
    private [$appRoot]: Shokupan;
    public [$mountPath]: string = "/"; // Public via Symbol for OpenAPI generator

    private [$parent]: ShokupanRouter<T> | null = null;
    public [$childRouters]: ShokupanRouter<T>[] = [];
    public [$childControllers]: ShokupanController[] = [];

    private _hasOnResponseEndHook: boolean;
    private _hasOnRequestStartHook: boolean;
    private _hasOnRequestEndHook: boolean;
    private _hasOnResponseStartHook: boolean;
    private _hasOnErrorHook: boolean;
    private _hasOnRequestTimeoutHook: boolean;
    private _hasOnReadTimeoutHook: boolean;
    private _hasOnWriteTimeoutHook: boolean;
    private _hasBeforeValidateHook: boolean;
    private _hasAfterValidateHook: boolean;
    get hasOnResponseEndHook() { return this._hasOnResponseEndHook; };
    get hasOnRequestStartHook() { return this._hasOnRequestStartHook; };
    get hasOnRequestEndHook() { return this._hasOnRequestEndHook; };
    get hasOnResponseStartHook() { return this._hasOnResponseStartHook; };
    get hasOnErrorHook() { return this._hasOnErrorHook; };
    get hasOnRequestTimeoutHook() { return this._hasOnRequestTimeoutHook; };
    get hasOnReadTimeoutHook() { return this._hasOnReadTimeoutHook; };
    get hasOnWriteTimeoutHook() { return this._hasOnWriteTimeoutHook; };
    get hasBeforeValidateHook() { return this._hasBeforeValidateHook; };
    get hasAfterValidateHook() { return this._hasAfterValidateHook; };

    public requestTimeout?: number;



    private hookCache = new Map<keyof ShokupanHooks, Function[]>();
    private hooksInitialized: boolean = false;

    public middleware: Middleware[] = [];

    get rootConfig() {
        return this[$appRoot]?.applicationConfig;
    }
    get root() {
        return this[$appRoot];
    }

    get logger() {
        return this[$appRoot]?.logger;
    }

    public [$routes]: ShokupanRoute[] = []; // Public via Symbol for OpenAPI generator
    private trie = new RouterTrie<T>();
    public metadata?: RouteMetadata; // Metadata for the router itself

    public mcpProtocol = new McpProtocol();

    private currentGuards: { handler: ShokupanHandler<T>; spec?: GuardAPISpec; }[] = [];
    private eventHandlers = new Map<string, ShokupanHandler<T>[]>();
    private wrappedHandlers = new WeakMap<ShokupanHandler<T>, ShokupanHandler<T>>();

    /**
     * Registers middleware for this router.
     * Middleware will run for all routes matched by this router.
     */
    public use(middleware: Middleware) {
        // Basic middleware registration
        this.middleware.push(middleware);
        return this;
    }


    // Registry Accessor
    public get registry(): {
        metadata: RouteMetadata,
        middleware: { name: string, metadata: RouteMetadata, order: number, _fn: Middleware; }[],
        routes: { type: 'route', path: string, method: Method, metadata: RouteMetadata, handlerName: string, tags: string[], order: number, _fn: ShokupanHandler<T>; }[],
        routers: { type: 'router', path: string, metadata: RouteMetadata, children: { routes: any[]; }; }[],
        controllers: { type: 'controller', path: string, name: string, metadata: RouteMetadata; children: { routes: any[]; }; }[];
        events: { type: 'event', name: string, handlerName: string, metadata: RouteMetadata; _fn: ShokupanHandler<T>; }[];
    } {
        // Separation logic: Group routes by controller instance
        const controllerRoutesMap = new Map<any, any[]>();
        const localRoutes: any[] = [];

        for (let i = 0; i < this[$routes].length; i++) {
            const r = this[$routes][i];
            const entry = {
                type: 'route' as 'route',
                path: r.path.startsWith('/') ? r.path : '/' + r.path,
                method: r.method,
                metadata: r.metadata,
                handlerName: r.handler.name,
                tags: r.handlerSpec?.tags,
                order: r.order,
                _fn: r.handler
            };

            if (r.controller) {
                if (!controllerRoutesMap.has(r.controller)) {
                    controllerRoutesMap.set(r.controller, []);
                }
                controllerRoutesMap.get(r.controller)!.push(entry);
            } else {
                localRoutes.push(entry);
            }
        }

        // Collect middleware (if exists, e.g. on Shokupan app)
        const mw = this.middleware;
        const middleware = mw ? mw.map(m => ({
            name: m.name || 'middleware',
            metadata: m.metadata,
            order: m.order,
            _fn: m // Expose function for debugging instrumentation
        })) : [];

        // Collect child routers
        const routers = this[$childRouters].map((r: ShokupanRouter<T>) => ({
            type: 'router' as 'router',
            path: r[$mountPath].startsWith('/') ? r[$mountPath] : '/' + r[$mountPath],
            metadata: r.metadata,
            children: r.registry
        }));

        // Collect child controllers
        const controllers = this[$childControllers].map((c: ShokupanController<T>) => {
            const routes = controllerRoutesMap.get(c) || [];
            return {
                type: 'controller' as 'controller',
                path: (c as any)[$mountPath] || '/',
                name: c.constructor.name,
                metadata: (c as any).metadata,
                children: { routes }
            };
        });

        // Collect event handlers
        const events: any[] = [];
        this.eventHandlers.forEach((handlers, name) => {
            handlers.forEach(h => {
                events.push({
                    type: 'event',
                    name,
                    handlerName: h.name,
                    metadata: (h as any).source ? { file: (h as any).source.file, line: (h as any).source.line } : undefined,
                    _fn: h
                });
            });
        });

        return {
            metadata: this.metadata,
            middleware,
            routes: localRoutes,
            routers,
            controllers,
            events
        };
    }

    constructor(
        public readonly config?: ShokupanRouteConfig
    ) {
        if (config?.requestTimeout) {
            this.requestTimeout = config.requestTimeout;
        }
        if (config?.hooks) {
            this.ensureHooksInitialized();
        }
    }

    private isRouterInstance(target: any): target is ShokupanRouter<T> {
        // Check if it's an object and has your specific symbol
        return typeof target === 'object' && target !== null && $isRouter in target;
    }



    /**
     * Registers a lifecycle hook dynamically.
     */
    public hook(name: keyof ShokupanHooks, handler: Function) {
        if (!this.hooksInitialized) {
            this.ensureHooksInitialized();
        }

        let handlers = this.hookCache.get(name);
        if (!handlers) {
            handlers = [];
            this.hookCache.set(name, handlers);

            // Set the has hooks flags
            this._hasOnErrorHook ||= name === 'onError';
            this._hasOnRequestStartHook ||= name === 'onRequestStart';
            this._hasOnRequestEndHook ||= name === 'onRequestEnd';
            this._hasOnResponseStartHook ||= name === 'onResponseStart';
            this._hasOnResponseEndHook ||= name === 'onResponseEnd';
            this._hasOnRequestTimeoutHook ||= name === 'onRequestTimeout';
            this._hasOnReadTimeoutHook ||= name === 'onReadTimeout';
            this._hasOnWriteTimeoutHook ||= name === 'onWriteTimeout';
            this._hasBeforeValidateHook ||= name === 'beforeValidate';
            this._hasAfterValidateHook ||= name === 'afterValidate';
        }
        handlers.push(handler);
        return this;
    }

    /**
     * Registers an MCP Tool.
     */
    public tool(name: string, schema: any, handler: Function) {
        this.mcpProtocol.addTool({
            name,
            inputSchema: schema,
            handler: handler as any
        });
        return this;
    }

    /**
     * Registers an MCP Prompt.
     */
    public prompt(name: string, args: McpPrompt['arguments'], handler: Function) {
        this.mcpProtocol.addPrompt({
            name,
            arguments: args,
            handler: handler as any
        });
        return this;
    }

    /**
     * Registers an MCP Resource.
     */
    public resource(uri: string, options: { name?: string; description?: string; mimeType?: string; }, handler: Function) {
        this.mcpProtocol.addResource({
            uri,
            handler: handler as any,
            ...options
        });
        return this;
    }

    /**
     * Finds an event handler(s) by name.
     */
    public findEvent(name: string): ShokupanHandler<T>[] | null {
        // Check local
        const handlers = this.eventHandlers.get(name);
        if (handlers !== undefined) {
            return handlers;
        }

        // Check children
        for (const child of this[$childRouters]) {
            const handler = child.findEvent(name);
            if (handler) return handler;
        }

        return null;
    }

    /**
     * Registers a controller instance to the router.
     */
    public bindController(controller: any) {
        this[$childControllers].push(controller);
    }

    /**
     * Returns all registered event handlers.
     */
    public getEventHandlers(): Map<string, ShokupanHandler<T>[]> {
        return this.eventHandlers;
    }

    /**
     * Mounts a controller instance or WebSocket router to a path prefix.
     * 
     * Controller can be a convention router, WebSocket router, or an arbitrary class.
     * 
     * Routes are derived from method names:
     * - get(ctx) -> GET /prefix/
     * - getUsers(ctx) -> GET /prefix/users
     * - postCreate(ctx) -> POST /prefix/create
     */
    public mount(prefix: string, controller: ShokupanController | ShokupanController<T> | ShokupanRouter | ShokupanRouter<T> | Record<string, any>) {
        // Check if it's a WebSocket router
        if (ShokupanWebsocketRouter.isWebSocketRouter(controller)) {
            this.mountWebSocketRouter(prefix, controller);
            return this;
        }

        // Check if it's a WebSocket controller (class with decorators)
        // Wrap in try-catch to handle cases where reflect-metadata isn't loaded yet
        try {
            if (isWebSocketController(controller)) {
                this.mountWebSocketController(prefix, controller);
                return this;
            }
        } catch (e) {
            // reflect-metadata not available or other error - continue with normal mounting
            // This allows the framework to work even if decorators aren't used
        }

        // strict controller check
        const isRouter = this.isRouterInstance(controller);
        const isFunction = typeof controller === 'function';
        const controllersOnly = this.config?.controllersOnly ?? this.rootConfig?.controllersOnly ?? false;

        if (controllersOnly && !isFunction && !isRouter) {
            throw new Error(`[Shokupan] strict controller check failed: ${controller.constructor.name || typeof controller} is not a class constructor.`);
        }

        if (this.isRouterInstance(controller)) {
            this.mountRouter(prefix, controller);
        }
        // Controller is an arbitrary class
        else {
            ControllerScanner.scan(this, prefix, controller);
        }

        return this;
    }

    /**
     * Mount a WebSocket router.
     * @internal
     */
    private mountWebSocketRouter(prefix: string, wsRouter: any) {
        // Register wsRouter as a child router for generator traversal
        if (!wsRouter[$mountPath]) {
            wsRouter[$mountPath] = prefix;
        }
        (this as any)[$childRouters].push(wsRouter);

        const handlers = wsRouter.getHandlers();
        const events = wsRouter.getEvents();

        // Register WebSocket route using .socket() method
        this.socket(prefix, (ctx) => {
            // Call onUpgrade for validation
            if (handlers.onUpgrade) {
                const result = handlers.onUpgrade(ctx);
                if (result === false) {
                    return ctx.text("Upgrade rejected", 403);
                }
            }

            return ctx.upgrade({
                open: async (ctx, ws) => {
                    // Call onOpen and set return value to ws.data and ctx.state
                    if (handlers.onOpen) {
                        const sessionData = await handlers.onOpen(ctx, ws);
                        if (sessionData !== undefined) {
                            ws.data = sessionData;
                            ctx.state = sessionData;
                        }
                        ctx[$ws] = ws;
                    }

                    // --- WebSocket Message Tracking ---
                    // Initialize storage
                    // Initialize storage
                    if (!(ctx as any)[$wsMessages]) (ctx as any)[$wsMessages] = [];

                    // Wrap send to capture outbound messages
                    const originalSend = ws.send.bind(ws);
                    ws.send = (data, compress) => {
                        const size = typeof data === 'string' ? data.length : (data instanceof ArrayBuffer ? data.byteLength : 0);
                        const msg = {
                            type: 'message',
                            dir: 'out',
                            timestamp: Date.now(),
                            data: data,
                            size: size
                        };
                        (ctx as any)[$wsMessages].push(msg);
                        if ((ctx as any)[$onWsMessage]) (ctx as any)[$onWsMessage](msg);
                        return originalSend(data, compress);
                    };

                    // Track Open Event
                    const openMsg = {
                        type: 'open',
                        dir: 'system',
                        timestamp: Date.now(),
                        size: 0
                    };
                    (ctx as any)[$wsMessages].push(openMsg);
                    if ((ctx as any)[$onWsMessage]) (ctx as any)[$onWsMessage](openMsg);
                    // ----------------------------------
                },
                message: async (ctx, ws, message: string | ArrayBuffer | Buffer) => {
                    // Call onMessage
                    if (handlers.onMessage) {
                        await handlers.onMessage(ctx, ws, message);
                    }

                    // --- WebSocket Message Tracking ---
                    const size = typeof message === 'string' ? message.length : (message instanceof ArrayBuffer ? message.byteLength : 0);
                    const msg = {
                        type: 'message',
                        dir: 'in',
                        timestamp: Date.now(),
                        data: message,
                        size: size
                    };
                    if ((ctx as any)[$wsMessages]) {
                        (ctx as any)[$wsMessages].push(msg);
                        if ((ctx as any)[$onWsMessage]) (ctx as any)[$onWsMessage](msg);
                    }
                    // ----------------------------------

                    // Try to parse as JSON for event routing
                    if (typeof message === 'string' && message.startsWith('{')) {
                        try {
                            const payload = JSON.parse(message);
                            const event = payload.event || payload.type;

                            if (event) {
                                // Call onEvent middleware
                                if (handlers.onEvent) {
                                    const shouldContinue = await handlers.onEvent(ctx, ws, event, payload.data);
                                    if (shouldContinue === false) {
                                        return; // Prevent event routing
                                    }
                                }

                                // Route to event handler
                                const eventHandler = events.get(event);
                                if (eventHandler) {
                                    await eventHandler(ctx, payload.data);
                                }
                            }
                        } catch (e) {
                            // Not JSON or parse error, ignore
                        }
                    }
                },
                close: async (ctx, ws, code?: number, reason?: string) => {
                    if (handlers.onClose) {
                        await handlers.onClose(ctx, ws, code, reason);
                    }

                    // --- WebSocket Message Tracking ---
                    const closeMsg = {
                        type: 'close',
                        dir: 'system',
                        timestamp: Date.now(),
                        size: 0,
                        code,
                        reason
                    };
                    if ((ctx as any)[$wsMessages]) {
                        (ctx as any)[$wsMessages].push(closeMsg);
                        if ((ctx as any)[$onWsMessage]) (ctx as any)[$onWsMessage](closeMsg);
                    }
                    // ----------------------------------
                }
            });
        });
    }

    /**
     * Mount a WebSocket controller (decorated with @WebsocketController).
     * @internal
     */
    private mountWebSocketController(prefix: string, controller: any) {
        // Create instance if it's a class constructor
        const instance = typeof controller === 'function' ? new controller() : controller;
        const constructor = instance.constructor;

        // Get handler method names from metadata
        const upgradeMethodName = getUpgradeHandler(constructor);
        const openMethodName = getOpenHandler(constructor);
        const eventMiddlewareMethodName = getEventMiddlewareHandler(constructor);
        const messageMethodName = getMessageHandler(constructor);
        const closeMethodName = getCloseHandler(constructor);
        const errorMethodName = getErrorHandler(constructor);
        const eventHandlers = getEventHandlers(constructor);


        // Register WebSocket route
        this.socket(prefix, (ctx) => {
            // Call onUpgrade for validation (if defined)
            if (upgradeMethodName) {
                const upgradeMethod = instance[upgradeMethodName as string];
                if (upgradeMethod) {
                    const result = upgradeMethod.call(instance, ctx);
                    if (result === false) {
                        return ctx.text("Upgrade rejected", 403);
                    }
                }
            }

            return ctx.upgrade({
                open: async (ctx, ws) => {
                    // Call onOpen (if defined)
                    if (openMethodName) {
                        const openMethod = instance[openMethodName as string];
                        if (openMethod) {
                            const sessionData = await openMethod.call(instance, ctx, ws);
                            if (sessionData !== undefined) {
                                ws.data = sessionData;
                                ctx.state = sessionData;
                            }
                        }
                    }

                    // --- WebSocket Message Tracking ---
                    // Initialize storage
                    if (!(ctx as any)[$wsMessages]) (ctx as any)[$wsMessages] = [];

                    // Wrap send to capture outbound messages
                    const originalSend = ws.send.bind(ws);
                    ws.send = (data, compress) => {
                        const size = typeof data === 'string' ? data.length : (data instanceof ArrayBuffer ? data.byteLength : 0);
                        const msg = {
                            type: 'message',
                            dir: 'out',
                            timestamp: Date.now(),
                            data: data,
                            size: size
                        };
                        (ctx as any)[$wsMessages].push(msg);
                        if ((ctx as any)[$onWsMessage]) (ctx as any)[$onWsMessage](msg);
                        return originalSend(data, compress);
                    };

                    // Track Open Event
                    const openMsg = {
                        type: 'open',
                        dir: 'system',
                        timestamp: Date.now(),
                        size: 0
                    };
                    (ctx as any)[$wsMessages].push(openMsg);
                    if ((ctx as any)[$onWsMessage]) (ctx as any)[$onWsMessage](openMsg);
                    // ----------------------------------
                },
                message: async (ctx, ws, message: string | ArrayBuffer | Buffer) => {
                    // Call onMessage (if defined)
                    if (messageMethodName) {
                        const messageMethod = instance[messageMethodName as string];
                        if (messageMethod) {
                            await messageMethod.call(instance, ctx, ws, message);
                        }
                    }

                    // --- WebSocket Message Tracking ---
                    const size = typeof message === 'string' ? message.length : (message instanceof ArrayBuffer ? message.byteLength : 0);
                    const msg = {
                        type: 'message',
                        dir: 'in',
                        timestamp: Date.now(),
                        data: message,
                        size: size
                    };
                    if ((ctx as any)[$wsMessages]) {
                        (ctx as any)[$wsMessages].push(msg);
                        if ((ctx as any)[$onWsMessage]) (ctx as any)[$onWsMessage](msg);
                    }
                    // ----------------------------------

                    // Try to parse as JSON for event routing
                    if (typeof message === 'string' && message.startsWith('{')) {
                        try {
                            const payload = JSON.parse(message);
                            const event = payload.event || payload.type;

                            if (event) {
                                // Call onEvent middleware (if defined)
                                if (eventMiddlewareMethodName) {
                                    const eventMiddlewareMethod = instance[eventMiddlewareMethodName as string];
                                    if (eventMiddlewareMethod) {
                                        const shouldContinue = await eventMiddlewareMethod.call(instance, ctx, ws, event, payload.data);
                                        if (shouldContinue === false) {
                                            return; // Prevent event routing
                                        }
                                    }
                                }

                                // Route to event handler
                                const eventHandler = eventHandlers.find(eh => eh.event === event);
                                if (eventHandler) {
                                    const eventMethod = instance[eventHandler.methodName as string];
                                    if (eventMethod) {
                                        await eventMethod.call(instance, ctx, payload.data);
                                    }
                                }
                            }
                        } catch (e) {
                            // Not JSON or parse error, ignore
                        }
                    }
                },
                close: async (ctx, ws, code?: number, reason?: string) => {
                    // Call onClose (if defined)
                    if (closeMethodName) {
                        const closeMethod = instance[closeMethodName as string];
                        if (closeMethod) {
                            await closeMethod.call(instance, ctx, ws, code, reason);
                        }
                    }

                    // --- WebSocket Message Tracking ---
                    const closeMsg = {
                        type: 'close',
                        dir: 'system',
                        timestamp: Date.now(),
                        size: 0,
                        code,
                        reason
                    };
                    if ((ctx as any)[$wsMessages]) {
                        (ctx as any)[$wsMessages].push(closeMsg);
                        if ((ctx as any)[$onWsMessage]) (ctx as any)[$onWsMessage](closeMsg);
                    }
                    // ----------------------------------
                },
                error: async (ctx, ws, error) => {
                    // Call onError (if defined)
                    if (errorMethodName) {
                        const errorMethod = instance[errorMethodName as string];
                        if (errorMethod) {
                            await errorMethod.call(instance, ctx, ws, error);
                        }
                    }
                }
            });
        });

        // Register events for AsyncAPI generation
        // We directly access eventHandlers to avoid deprecation warning of .event()
        eventHandlers.forEach(eh => {
            const eventMethod = instance[eh.methodName as string];
            if (!eventMethod) return;

            // Create a dummy handler solely for metadata extraction in AsyncAPI generator
            const trackingHandler: ShokupanHandler<T> = async (ctx, data) => {
                return eventMethod.call(instance, ctx, data);
            };

            // Attach Spec metadata
            // We need to retrieve @Spec from the method if it exists
            const proto = Object.getPrototypeOf(instance);
            const decoratedSpecs = (constructor as any)[$routeSpec] || (proto && (proto as any)[$routeSpec]);
            if (decoratedSpecs) {
                const userSpec = decoratedSpecs.get(eh.methodName);
                if (userSpec) {
                    (trackingHandler as any).spec = userSpec;
                }
            }

            // Attach source info
            const info = getCallerInfo(); // This might be wrong, we want the source of the method
            // But we don't have it easily unless we stored it in metadata.
            // For now, let's just register it.

            if (this.eventHandlers.has(eh.event)) {
                this.eventHandlers.get(eh.event)!.push(trackingHandler);
            } else {
                this.eventHandlers.set(eh.event, [trackingHandler]);
            }
        });
    }

    /**
     * Returns all routes attached to this router and its descendants.
     */
    public getRoutes(): { method: Method, path: string, handler: ShokupanHandler<T>; }[] {
        const routes = this[$routes].map(r => ({
            method: r.method,
            path: r.path,
            handler: r.handler
        }));

        for (let i = 0; i < this[$childRouters].length; i++) {
            const child = this[$childRouters][i];
            const childRoutes = child.getRoutes();
            for (let j = 0; j < childRoutes.length; j++) {
                const route = childRoutes[j];
                const cleanPrefix = child[$mountPath].endsWith("/") ? child[$mountPath].slice(0, -1) : child[$mountPath];
                const cleanPath = route.path.startsWith("/") ? route.path : "/" + route.path;
                const fullPath = (cleanPrefix + cleanPath) || "/";

                routes.push({
                    method: route.method as Method,
                    path: fullPath,
                    handler: route.handler
                });
            }
        }
        return routes;
    }

    /**
     * Makes an internal request through this router's full routing pipeline.
     * This is useful for calling other routes internally and supports streaming responses.
     * @param options The request options.
     * @returns The raw Response object.
     */
    public async internalRequest(arg: {
        path: string;
        method?: Method;
        headers?: HeadersInit;
        body?: any;
    } | string): Promise<Response> {
        const options = typeof arg === "string" ? { path: arg } : arg;

        let url = options.path;
        // If path is relative, make it absolute (required by Request constructor)
        if (!url.startsWith("http")) {
            const base = `http://${this.rootConfig?.hostname || "localhost"}:${this.rootConfig.port || 3000}`;

            // Ensure path starts with /
            const path = url.startsWith("/") ? url : "/" + url;
            url = base + path;
        }

        const req = new ShokupanRequest({
            method: options.method || "GET",
            url,
            headers: options.headers as any,
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        return this.root[$dispatch](req);
    }

    /**
     * Processes a request for testing purposes.
     * Returns a simplified { status, headers, data } object instead of a Response.
     */
    public async testRequest(options: RequestOptions): Promise<ProcessResult> {
        let url = options.url || options.path || "/";
        if (!url.startsWith("http")) {
            const base = `http://${this.rootConfig?.hostname || "localhost"}:${this.rootConfig?.port || 3000}`;
            const path = url.startsWith("/") ? url : "/" + url;
            url = base + path;
        }

        // Handle query params in options
        if (options.query) {
            const u = new URL(url);
            const entries = Object.entries(options.query);
            for (let i = 0; i < entries.length; i++) {
                const [k, v] = entries[i];
                u.searchParams.set(k, v);
            }
            url = u.toString();
        }

        const req = new ShokupanRequest({
            method: (options.method || "GET") as Method,
            url,
            headers: options.headers as any,
            body: options.body && typeof options.body === "object" ? JSON.stringify(options.body) : options.body
        });

        // Basic Dispatch Logic (moved/duplicated from Shokupan.handleRequest but simpler for pure Router)
        // Note: Pure Routers don't have global middleware usually, but if we call processRequest on them, 
        // we just run their routing logic.
        // HOWEVER, Shokupan.override will invoke middleware.

        const ctx = new ShokupanContext<T>(req);

        let result: any = null;
        let status: number = HTTP_STATUS.OK;
        const headers: Record<string, string> = {};

        const match = this.find(req.method, ctx.path);
        if (match) {
            ctx.params = match.params;
            try {
                result = await match.handler(ctx);
            } catch (err: any) {
                console.error(err);
                status = getErrorStatus(err);
                result = { error: err.message || "Internal Server Error" };
                if (err.errors) result.errors = err.errors;
            }
        }
        else {
            status = HTTP_STATUS.NOT_FOUND;
            result = "Not Found";
        }

        // Normalize Result
        // If result is Response object, we need to read it back to ProcessResult?
        // The user wants { status, headers, data }.
        // If handler returns Response, we extract data.

        if (result instanceof Response) {
            status = result.status;
            result.headers.forEach((v, k) => headers[k] = v);

            if (headers['content-type']?.includes('application/json')) {
                result = await result.json();
            }
            else {
                result = await result.text();
            }
        }

        return {
            status,
            headers,
            data: result
        };
    }

    private wrapWithHooks(handler: ShokupanHandler<T>) {
        // Ensure hooks are initialized before checking the cache
        if (!this.hooksInitialized) {
            this.ensureHooksInitialized();
        }

        const hasStart = this.hookCache.get('onRequestStart')?.length > 0;
        const hasEnd = this.hookCache.get('onRequestEnd')?.length > 0;
        const hasError = this.hookCache.get('onError')?.length > 0;

        if (!hasStart && !hasEnd && !hasError) return handler;

        const originalHandler = handler;

        const wrapped = async (ctx: ShokupanContext<T>) => {
            await this.runHooks("onRequestStart", ctx);

            const debug = ctx[$debug];
            let debugId: string | undefined;
            let previousNode: string | undefined;

            if (debug) {
                // @ts-ignore
                debugId = originalHandler._debugId || originalHandler.name || 'handler';
                previousNode = debug.getCurrentNode();
                debug.trackEdge(previousNode, debugId);
                debug.setNode(debugId!);
            }

            const start = performance.now();
            try {
                const res = await originalHandler(ctx);
                debug?.trackStep(debugId, 'handler', performance.now() - start, 'success');

                await this.runHooks("onRequestEnd", ctx);
                return res;
            } catch (err) {
                debug?.trackStep(debugId, 'handler', performance.now() - start, 'error', err);

                await this.runHooks("onError", ctx, err);
                throw err;
            } finally {
                if (debug && previousNode) debug.setNode(previousNode);
            }
        };
        // Preserve original handler reference for analysis if needed
        (wrapped as any).originalHandler = (originalHandler as any).originalHandler ?? originalHandler;
        return wrapped;
    }

    private mountRouter(prefix: string, router: ShokupanRouter<T>) {
        if (router[$isMounted]) {
            throw new Error("Router is already mounted");
        }

        router[$mountPath] = prefix;

        // Capture mount location if not already present
        if (!router.metadata) {
            const info = getCallerInfo();
            router.metadata = {
                file: info.file,
                line: info.line,
                name: 'MountedRouter'
            };
        }
        this[$childRouters].push(router);

        /**
         * Descendants are defined first, then mounted backwards up to the application root.
         * Thus, we have to recurse through the children and assign the root reference.
         */
        router[$parent] = this;

        const setRouterContext = (router: ShokupanRouter<T>) => {
            router[$appRoot] = this.root;
            router[$childRouters].forEach((child) => setRouterContext(child));
        };
        setRouterContext(router);

        router[$appRoot] = this.root;
        router[$isMounted] = true;
    }


    /**
     * Wraps a handler with this router's middleware.
     * Caches wrapped handlers to avoid re-wrapping on subsequent requests.
     */
    private wrapHandlerWithMiddleware(handler: ShokupanHandler<T>): ShokupanHandler<T> {
        // If no middleware, return as-is
        if (this.middleware.length === 0) {
            return handler;
        }

        // Check cache
        const cached = this.wrappedHandlers.get(handler);
        if (cached) return cached;

        // Create wrapped handler
        const fn = compose(this.middleware);
        const wrapped: ShokupanHandler<T> = async (ctx) => {
            return fn(ctx, () => handler(ctx));
        };

        // Copy metadata
        (wrapped as any).originalHandler = (handler as any).originalHandler || handler;
        (wrapped as any).metadata = (handler as any).metadata;

        // Cache it
        this.wrappedHandlers.set(handler, wrapped);

        return wrapped;
    }

    /**
     * Find a route matching the given method and path.
     * Wraps handler with router middleware if present.
     * @param method HTTP method
     * @param path Request path
     * @returns Route handler and parameters if found, otherwise null
     */
    public find(method: string, path: string): { handler: ShokupanHandler<T>; params: Record<string, string>; } | null {
        // console.log(`[Router] find ${method} ${path} (routes: ${this.routes.length}, children: ${this[$childRouters].length})`);


        // 1. Check local routes
        let result = this.trie.search(method, path);
        if (result) {
            // Wrap with router middleware if present
            result.handler = this.wrapHandlerWithMiddleware(result.handler);
            return result;
        }

        // Fallback: If HEAD not found, try GET
        if (method === "HEAD") {
            result = this.trie.search("GET", path);
            if (result) {
                result.handler = this.wrapHandlerWithMiddleware(result.handler);
                return result;
            }
        }

        // 2. Check child routers
        for (let i = 0; i < this[$childRouters].length; i++) {
            const child = this[$childRouters][i];
            const prefix = child[$mountPath];

            if (path === prefix || path.startsWith(prefix + "/")) {
                const subPath = path.slice(prefix.length) || "/";
                const match = child.find(method, subPath);
                // Child router handlers are already wrapped with child middleware
                // Just return them as-is (parent hooks are applied at the app level in handleRequest)
                if (match) return match;
            }
            // Handle case where prefix ends with /
            if (prefix.endsWith("/")) {
                if (path.startsWith(prefix)) {
                    const subPath = path.slice(prefix.length) || "/";
                    const match = child.find(method, subPath);
                    if (match) return match;
                }
            }
        }

        return null; // Not found
    }

    private parsePath(path: string): { regex: RegExp; keys: string[]; } {
        if (typeof path !== 'string') {
            throw new Error(`Route path must be a string or regexp, received ${typeof path == "function" ? (path['name'] || path['constructor']?.['name'] || 'function') : typeof path}. Dynamic paths are **highly** discouraged.`);
        }

        const keys: string[] = [];

        // Security: Validate path length to prevent ReDoS
        if (path.length > 2048) {
            throw new Error('Path too long');
        }

        const pattern = path
            .replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
                keys.push(key);
                // Security: Add length limit to prevent ReDoS
                return "([^/]{1,255})";
            })
            // Security: Limit recursive wildcard to prevent ReDoS
            .replace(/\*\*/g, ".{0,1000}")
            // Security: Limit single segment wildcard to prevent ReDoS  
            .replace(/\*/g, "[^/]{1,255}");

        return {
            regex: new RegExp(`^${pattern}$`),
            keys
        };
    }

    /**
     * Adds a route to the router.
     * 
     * @param arg - Route configuration object
     * @param arg.method - HTTP method
     * @param arg.path - URL path
     * @param arg.spec - OpenAPI specification for the route
     * @param arg.handler - Route handler function
     * @param arg.regex - Custom regex for path matching
     * @param arg.group - Group for the route
     * @param arg.requestTimeout - Timeout for this route in milliseconds
     * @param arg.renderer - JSX renderer for the route
     * @param arg.controller - Controller for the route
     */
    public add({ method, path, spec, handler, regex: customRegex, group, requestTimeout, renderer, controller, metadata, middleware }: {
        method: Method,
        path: string,
        spec?: MethodAPISpec,
        handler: ShokupanHandler<T>;
        regex?: RegExp;
        group?: string;
        requestTimeout?: number;
        renderer?: JSXRenderer;
        controller?: any;
        middleware?: Middleware[];
        metadata?: { file: string; line: number; };
    }) {
        const { regex, keys } = customRegex
            ? { regex: customRegex, keys: [] }
            : this.parsePath(path);

        // Merge specs from guards
        if (this.currentGuards.length > 0) {
            spec = spec || {};
            for (let i = 0; i < this.currentGuards.length; i++) {
                const guard = this.currentGuards[i];
                if (guard.spec) {
                    // Merge Responses
                    if (guard.spec.responses) {
                        spec.responses = spec.responses || {};
                        Object.assign(spec.responses, guard.spec.responses);
                    }

                    // Merge Security
                    if (guard.spec.security) {
                        spec.security = spec.security || [];
                        spec.security.push(...guard.spec.security);
                    }
                }
            }
        }

        // --- Flattened Route Execution Wrapper ---
        const effectiveTimeout = requestTimeout ?? this.requestTimeout ?? this.rootConfig?.requestTimeout;
        const effectiveRenderer = renderer ?? this.config?.renderer ?? this.rootConfig?.renderer;
        const routeGuards = [...this.currentGuards];

        let wrappedHandler = handler;

        // Optimization: Only create a wrapper closure if we actually have features to apply
        if ((effectiveTimeout && effectiveTimeout > 0) || effectiveRenderer || routeGuards.length > 0) {
            const originalHandler = handler;
            wrappedHandler = async (ctx: ShokupanContext<T>) => {
                // 1. Timeout
                if (effectiveTimeout && effectiveTimeout > 0 && ctx.server) {
                    ctx.server.timeout(ctx.req as unknown as Request, effectiveTimeout / 1000);
                }

                // 2. Renderer
                if (effectiveRenderer) {
                    ctx.setRenderer(effectiveRenderer);
                }

                // 3. Guards
                // Execute guards in order
                if (routeGuards.length > 0) {
                    for (let i = 0; i < routeGuards.length; i++) {
                        const guard = routeGuards[i];
                        let guardPassed = false;
                        let nextCalled = false;
                        const next = () => {
                            nextCalled = true;
                            return Promise.resolve();
                        };

                        try {
                            const result = await guard.handler(ctx, next);
                            if (result === true || nextCalled) {
                                guardPassed = true;
                            } else if (result !== undefined && result !== null && result !== false) {
                                return result;
                            } else {
                                return ctx.json({ error: 'Forbidden' }, 403);
                            }
                        } catch (error) {
                            throw error;
                        }

                        if (!guardPassed) {
                            return ctx.json({ error: 'Forbidden' }, 403);
                        }
                    }
                }

                // 4. Handler
                return originalHandler(ctx);
            };
            (wrappedHandler as any).originalHandler = (handler as any).originalHandler || handler;
        }

        // --- Middleware Tracking Logic ---
        // If metadata is provided (e.g. from controller), use it. Otherwise capture caller info.
        const { file, line } = metadata || getCallerInfo();

        wrappedHandler = MiddlewareTracker.wrap(wrappedHandler, {
            file,
            line,
            name: handler.name || 'anonymous',
            isBuiltin: (handler as any).isBuiltin,
            pluginName: (handler as any).pluginName
        });

        // Bake in Hooks if present (Optimization)
        let bakedHandler = wrappedHandler;
        if (this.config?.hooks) {
            bakedHandler = this.wrapWithHooks(wrappedHandler);
        }

        // Store for OpenAPI (still use list)
        this[$routes].push({
            method,
            path,
            regex: regex ?? new RegExp(''),
            keys: keys ?? [],
            handler,
            bakedHandler,
            handlerSpec: spec,
            group,
            hooks: this.config?.hooks as any,
            requestTimeout,
            renderer,
            metadata: {
                file,
                line
            },
            controller,
            middleware: middleware || []
        });

        // Insert into Trie
        this.trie.insert(method, path, bakedHandler);

        return this;
    }

    /**
     * Adds a GET route to the router.
     * 
     * @param path - URL path    
     * @param handlers - Route handler functions 
     */
    public get<Path extends string>(path: Path, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a GET route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public get<Path extends string>(path: Path, spec: MethodAPISpec, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    public get(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("GET", path, ...args);
        return this;
    }

    /**
     * Adds a POST route to the router.
     * 
     * @param path - URL path    
     * @param handlers - Route handler functions 
     */
    public post<Path extends string>(path: Path, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a POST route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public post<Path extends string>(path: Path, spec: MethodAPISpec, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    public post(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("POST", path, ...args);
        return this;
    }

    /**
     * Adds a PUT route to the router.
     * 
     * @param path - URL path    
     * @param handlers - Route handler functions 
     */
    public put<Path extends string>(path: Path, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a PUT route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public put<Path extends string>(path: Path, spec: MethodAPISpec, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    public put(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("PUT", path, ...args);
        return this;
    }

    /**
     * Adds a DELETE route to the router.
     * 
     * @param path - URL path    
     * @param handlers - Route handler functions 
     */
    public delete<Path extends string>(path: Path, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a DELETE route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public delete<Path extends string>(path: Path, spec: MethodAPISpec, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    public delete(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("DELETE", path, ...args);
        return this;
    }

    /**
     * Adds a PATCH route to the router.
     * 
     * @param path - URL path    
     * @param handlers - Route handler functions 
     */
    public patch<Path extends string>(path: Path, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a PATCH route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public patch<Path extends string>(path: Path, spec: MethodAPISpec, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    public patch(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("PATCH", path, ...args);
        return this;
    }

    /**
     * Adds a OPTIONS route to the router.
     * 
     * @param path - URL path    
     * @param handlers - Route handler functions 
     */
    public options<Path extends string>(path: Path, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a OPTIONS route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public options<Path extends string>(path: Path, spec: MethodAPISpec, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    public options(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("OPTIONS", path, ...args);
        return this;
    }

    /**
     * Adds a HEAD route to the router.
     * 
     * @param path - URL path    
     * @param handlers - Route handler functions 
     */
    public head<Path extends string>(path: Path, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a HEAD route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public head<Path extends string>(path: Path, spec: MethodAPISpec, handler: ShokupanHandler<T, RouteParams<Path>>, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    public head(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("HEAD", path, ...args);
        return this;
    }

    /**
     * Adds a WebSocket route that handles its own upgrade logic.
     * 
     * Unless you need to handle the upgrade manually, you should use a `ShokupanWebsocketRouter` or `WebsocketController` instead.
     * 
     * Routes registered with `.socket()` will NOT be automatically upgraded by Shokupan's WebSocket handling. You must implement
     * all event handlers manually. You have been warned.
     * 
     * @param path - URL path for the WebSocket endpoint
     * @param handler - Route handler that will manually handle the upgrade
     * 
     * @example
     * ```ts
     * router.socket("/ws", (ctx) => {
     *   const success = ctx.upgrade({
     *     data: {
     *       handler: {
     *         open: (ws) => console.log("Connected"),
     *         message: (ws, msg) => ws.send(msg),
     *         close: (ws) => console.log("Disconnected")
     *       }
     *     }
     *   });
     *   if (!success) return ctx.text("Upgrade failed", 400);
     * });
     * ```
     */
    public socket<Path extends string>(path: Path, handler: ShokupanHandler<T, RouteParams<Path>>): this {
        const { regex, keys } = this.parsePath(path);

        // Mark handler with a flag to prevent auto-upgrade
        (handler as any).__isSocketRoute = true;

        this[$routes].push({
            method: "GET",
            path,
            regex,
            keys,
            handler,
            bakedHandler: handler,
            handlerSpec: undefined,
            group: undefined,
            hooks: this.config?.hooks as any,
            requestTimeout: this.requestTimeout,
            renderer: this.config?.renderer,
            metadata: getCallerInfo(),
            controller: undefined,
            middleware: [],
            isSocket: true  // Add flag to route metadata
        });

        // Insert into Trie with socket marker
        this.trie.insert("GET", path, handler);

        return this;
    }

    /**
     * Adds a guard to the router that applies to all routes added **after** this point.
     * Guards must return true or call `ctx.next()` to allow the request to continue.
     * 
     * @param handler - Guard handler function 
     */
    public guard(handler: ShokupanHandler<T>): void;
    /**
     * Adds a guard to the router that applies to all routes added **after** this point.
     * Guards must return true or call `ctx.next()` to allow the request to continue.
     
     * @param spec - OpenAPI specification for the guard
     * @param handler - Guard handler function 
     */
    public guard(spec: GuardAPISpec, handler: ShokupanHandler<T>);
    public guard(specOrHandler: GuardAPISpec | ShokupanHandler<T>, handler?: ShokupanHandler<T>) {
        const spec = typeof specOrHandler === "function" ? undefined : specOrHandler as GuardAPISpec;
        const guardHandler = typeof specOrHandler === "function" ? specOrHandler as ShokupanHandler<T> : handler as ShokupanHandler<T>;

        // --- Middleware Tracking Logic ---
        let file = 'unknown';
        let line = 0;
        try {
            const err = new Error();
            const stack = err.stack?.split('\n') || [];
            const callerLine = stack.find(l =>
                l.includes(':') &&
                !l.includes('router.ts') &&
                !l.includes('shokupan.ts') &&
                !l.includes('node_modules') &&
                !l.includes('bun:main')
            );
            if (callerLine) {
                // Regex should prevent regex DoS attacks
                const match = callerLine.match(/\((.{0,1000}):(\d{1,10}):(?:\d{1,10})\)/) ||
                    callerLine.match(/at (.{0,1000}):(\d{1,10}):(?:\d{1,10})/);
                if (match) {
                    file = match[1];
                    line = parseInt(match[2], 10);
                }
            }
        } catch (e) { }

        const trackedGuard = MiddlewareTracker.wrap(guardHandler, {
            file,
            line,
            name: guardHandler.name || 'guard'
        });

        this.currentGuards.push({ handler: trackedGuard, spec });

        return this;
    }

    /**
     * Statically serves a directory with standard options.
     * @param uriPath URL path prefix
     * @param options Configuration options or root directory string
     */
    public static(uriPath: string, options: string | StaticServeOptions<T>) {
        const config: StaticServeOptions<T> = typeof options === 'string' ? { root: options } : options;
        // Normalize path prefix to ensure it has leading slash and no trailing slash for consistent matching
        const prefix = uriPath.startsWith('/') ? uriPath : '/' + uriPath;
        const normalizedPrefix = prefix.endsWith('/') && prefix !== '/' ? prefix.slice(0, -1) : prefix;

        // Correct usage of the new plugin:
        const handlerMiddleware = serveStatic(config, prefix);

        const routeHandler = async (ctx: ShokupanContext<T>) => {
            return handlerMiddleware(ctx, async () => { });
        };

        // Derive Group/Tag name from the path's last segment
        // e.g. /assets -> Assets
        let groupName = "Static";
        const segments = normalizedPrefix.split('/').filter(Boolean);
        if (segments.length > 0) {
            const last = segments[segments.length - 1];
            groupName = last.charAt(0).toUpperCase() + last.slice(1);
        }

        const defaultSpec = {
            summary: "Static Content",
            description: "Serves static files from " + normalizedPrefix,
            tags: [groupName]
        };
        const spec = config.openapi ? config.openapi : defaultSpec;
        if (!spec.tags) spec.tags = [groupName];
        else if (!spec.tags.includes(groupName)) spec.tags.push(groupName);

        const pattern = `^${normalizedPrefix}(/.*)?$`;
        const regex = new RegExp(pattern);

        // Display path in OpenAPI as /prefix/*
        const displayPath = normalizedPrefix === '/' ? '/*' : normalizedPrefix + '/*';

        this.add({ method: 'GET', path: displayPath, handler: routeHandler, spec, regex });
        this.add({ method: 'HEAD', path: displayPath, handler: routeHandler, spec, regex });

        return this;
    }


    /**
     * Attach the verb routes with their overload signatures.
     * Use compose to handle multiple handlers (middleware).
     */
    private attachVerb(method: Method, path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        let spec: MethodAPISpec | undefined;
        let handlers: ShokupanHandler<T>[] = [];

        if (args.length > 0) {
            // Check if first arg is an object (Spec) and NOT a ShokupanHandler (function)
            if (typeof args[0] === 'object' && args[0] !== null) {
                spec = args[0] as MethodAPISpec;
                handlers = args.slice(1) as ShokupanHandler<T>[];
            } else {
                handlers = args as ShokupanHandler<T>[];
            }
        }

        if (handlers.length === 0) {
            // Should potentially throw or warn?
            return;
        }

        let finalHandler = handlers[handlers.length - 1];

        if (handlers.length > 1) {
            // Since handlers are [ctx, next?], they fit Strict Middleware signature.
            // compose takes Middleware[].
            // We assume ALL provided handlers are valid middleware/handlers.
            const fn = compose(handlers as any);
            finalHandler = (ctx) => fn(ctx);
        }

        this.add({
            method,
            path,
            spec,
            handler: finalHandler,
            middleware: handlers.slice(0, handlers.length - 1) as Middleware[]
        });
    }

    /**
     * Generates an OpenAPI 3.1 Document by recursing through the router and its descendants.
     * Now includes runtime analysis of handler functions to infer request/response types.
     */
    public generateApiSpec(options: OpenAPIOptions = {}): Promise<any> {
        return generateOpenApi(this, options);
    }

    public hasHooks(name: keyof ShokupanHooks): boolean {
        if (!this.hooksInitialized) {
            this.ensureHooksInitialized();
        }
        const hooks = this.hookCache.get(name);
        return hooks !== undefined && hooks.length > 0;
    }

    private ensureHooksInitialized() {
        const hooks = this.config?.hooks;
        if (hooks) {
            const hookList = Array.isArray(hooks) ? hooks : [hooks];

            // Pre-compute lookup for each hook type
            const hookTypes: (keyof ShokupanHooks)[] = [
                'onRequestStart', 'onRequestEnd',
                'onResponseStart', 'onResponseEnd',
                'onError',
                'beforeValidate', 'afterValidate',
                'onRequestTimeout', 'onReadTimeout', 'onWriteTimeout'
            ];

            for (let i = 0; i < hookTypes.length; i++) {
                const type = hookTypes[i];
                const fns: Function[] = [];
                for (let j = 0; j < hookList.length; j++) {
                    const h = hookList[j];
                    if (h[type]) fns.push(h[type]!);
                }
                if (fns.length > 0) {
                    // console.log(`[Router] Found hook ${type} (${fns.length}) for router ${this.constructor.name}`);
                    // Set the has hooks flags for much faster check
                    this._hasOnErrorHook ||= type === 'onError';
                    this._hasOnRequestStartHook ||= type === 'onRequestStart';
                    this._hasOnRequestEndHook ||= type === 'onRequestEnd';
                    this._hasOnResponseStartHook ||= type === 'onResponseStart';
                    this._hasOnResponseEndHook ||= type === 'onResponseEnd';
                    this._hasOnRequestTimeoutHook ||= type === 'onRequestTimeout';
                    this._hasOnReadTimeoutHook ||= type === 'onReadTimeout';
                    this._hasOnWriteTimeoutHook ||= type === 'onWriteTimeout';
                    this._hasBeforeValidateHook ||= type === 'beforeValidate';
                    this._hasAfterValidateHook ||= type === 'afterValidate';

                    this.hookCache.set(type, fns);
                }
            }
        }
        this.hooksInitialized = true;
    }

    public runHooks(name: keyof ShokupanHooks, ...args: any[]): void | Promise<void[]> {
        // Optimization: Use hasHook check before calling this usually
        // But we ensure initialized here too just in case
        if (!this.hooksInitialized) {
            this.ensureHooksInitialized();
        }
        const fns = this.hookCache.get(name);
        if (!fns) return;

        // Check if debug tracking is enabled (ctx is typically the first argument for most hooks)
        const ctx = args?.[0] instanceof ShokupanContext ? args[0] : undefined;
        const debug = ctx?.[$debug];

        if (debug) {
            // Track each hook individually with debug timing
            return Promise.all(fns.map(async (fn, index) => {
                const hookId = `hook_${name}_${fn.name || index}`;
                const previousNode = debug.getCurrentNode();

                debug.trackEdge(previousNode, hookId);
                debug.setNode(hookId);

                const start = performance.now();
                try {
                    await fn(...args);
                    const duration = performance.now() - start;
                    debug.trackStep(hookId, 'hook', duration, 'success');
                } catch (error) {
                    const duration = performance.now() - start;
                    debug.trackStep(hookId, 'hook', duration, 'error', error);
                    throw error;
                } finally {
                    if (previousNode) debug.setNode(previousNode);
                }
            }));
        } else {
            // Fast path: no debug tracking
            return Promise.all(fns.map(fn => fn(...args)));
        }
    }
}
