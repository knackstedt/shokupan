import { ShokupanContext } from './context';
import { Container } from './di';
import { compose } from './middleware';
import { generateOpenApi } from './plugins/openapi';
import { serveStatic } from './plugins/serve-static';
import { ShokupanRequest } from './request';
import type { Shokupan } from './shokupan';
import { $appRoot, $childControllers, $childRouters, $controllerPath, $dispatch, $isApplication, $isMounted, $isRouter, $middleware, $mountPath, $parent, $routeArgs, $routeMethods, $routes, $routeSpec } from './symbol';

import { type GuardAPISpec, HTTPMethods, type JSXRenderer, type Method, type MethodAPISpec, type Middleware, type OpenAPIOptions, type ProcessResult, type RequestOptions, type RouteMetadata, RouteParamType, type ShokupanController, type ShokupanHandler, type ShokupanRoute, type ShokupanRouteConfig, type StaticServeOptions } from './types';
import { asyncContext } from './util/async-hooks';
import { traceHandler } from './util/instrumentation';
import { getCallerInfo } from './util/stack';


// Shim for HeadersInit if not available globally
type HeadersInit = Headers | Record<string, string> | [string, string][];


export const RouterRegistry = new Map<string, ShokupanRouter<any>>();

export const ShokupanApplicationTree = {};

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

    public middleware: Middleware[] = [];

    get rootConfig() {
        return this[$appRoot]?.applicationConfig;
    }
    get root() {
        return this[$appRoot];
    }

    public [$routes]: ShokupanRoute[] = []; // Public via Symbol for OpenAPI generator
    public metadata?: RouteMetadata; // Metadata for the router itself

    private currentGuards: { handler: ShokupanHandler<T>; spec?: GuardAPISpec; }[] = [];

    // Registry Accessor
    public getComponentRegistry() {
        // Collect local routes
        const routes = this[$routes].map(r => ({
            type: 'route',
            path: r.path,
            method: r.method,
            metadata: r.metadata,
            handlerName: r.handler.name,
            tags: r.handlerSpec?.tags,
            order: r.order,
            _fn: r.handler // Expose handler for debugging instrumentation
        }));

        // Collect middleware (if exists, e.g. on Shokupan app)
        const mw = this.middleware;
        const middleware = mw ? mw.map(m => ({
            name: m.name || 'middleware',
            metadata: m.metadata,
            order: m.order,
            _fn: m // Expose function for debugging instrumentation
        })) : [];

        // Collect child routers
        const routers = this[$childRouters].map(r => ({
            type: 'router',
            path: r[$mountPath],
            metadata: r.metadata,
            children: r.getComponentRegistry()
        }));

        // Collect child controllers
        const controllers = this[$childControllers].map(c => {
            // Controllers attached via instance... 
            // We might need to store metadata on instance during mount?
            return {
                type: 'controller',
                path: (c as any)[$mountPath] || '/',
                name: c.constructor.name,
                metadata: (c as any).metadata // Check if we can store this
            };
        });

        return {
            metadata: this.metadata,
            middleware,
            routes,
            routers,
            controllers
        };
    }

    constructor(
        public readonly config?: ShokupanRouteConfig
    ) {
        if (config?.requestTimeout) {
            this.requestTimeout = config.requestTimeout;
        }
    }

    private isRouterInstance(target: any): target is ShokupanRouter<T> {
        // Check if it's an object and has your specific symbol
        return typeof target === 'object' && target !== null && $isRouter in target;
    }

    /**
     * Mounts a controller instance to a path prefix.
     * 
     * Controller can be a convection router or an arbitrary class.
     * 
     * Routes are derived from method names:
     * - get(ctx) -> GET /prefix/
     * - getUsers(ctx) -> GET /prefix/users
     * - postCreate(ctx) -> POST /prefix/create
     */
    public mount(prefix: string, controller: ShokupanController | ShokupanController<T> | ShokupanRouter | ShokupanRouter<T> | Record<string, any>) {
        // strict controller check
        const isRouter = this.isRouterInstance(controller);
        const isFunction = typeof controller === 'function';
        const controllersOnly = this.config?.controllersOnly ?? this.rootConfig?.controllersOnly ?? false;

        if (controllersOnly && !isFunction && !isRouter) {
            throw new Error(`[Shokupan] strict controller check failed: ${controller.constructor.name || typeof controller} is not a class constructor.`);
        }

        if (this.isRouterInstance(controller)) {
            if (controller[$isMounted]) {
                throw new Error("Router is already mounted");
            }

            controller[$mountPath] = prefix;

            // Capture mount location if not already present (create new router usually has it? no)
            if (!controller.metadata) {
                const info = getCallerInfo();
                controller.metadata = {
                    file: info.file,
                    line: info.line,
                    name: 'MountedRouter'
                };
            }
            this[$childRouters].push(controller);

            /**
             * Descendants are defined first, then mounted backwards up to the application root.
             * Thus, we have to recurse through the children and assign the root reference.
             */
            controller[$parent] = this;

            const setRouterContext = (router: ShokupanRouter<T>) => {
                router[$appRoot] = this.root;
                router[$childRouters].forEach((child) => setRouterContext(child));
            };
            setRouterContext(controller);


            // If the controller is the root router
            if (this[$appRoot]) {
                // TODO:
            }
            controller[$appRoot] = this.root;
            controller[$isMounted] = true;
        }
        // Controller is an arbitrary class
        else {
            let instance = controller;
            if (typeof controller === 'function') {
                // DI Resolution
                instance = Container.resolve(controller as any);

                // Controller Parameter Decorator (@Controller('prefix'))
                const controllerPath = (controller as any)[$controllerPath];
                if (controllerPath) {
                    // Combine mount prefix + controller path
                    // mount('/api', Ctrl) + @Controller('/users') -> /api/users
                    const p1 = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
                    const p2 = controllerPath.startsWith("/") ? controllerPath : "/" + controllerPath;
                    prefix = (p1 + p2);
                    // Normalize
                    if (!prefix) prefix = "/";
                }
            }
            else {
                // Controller is an instance, read metadata from constructor
                const ctor = instance.constructor;
                const controllerPath = (ctor as any)[$controllerPath];
                if (controllerPath) {
                    const p1 = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
                    const p2 = controllerPath.startsWith("/") ? controllerPath : "/" + controllerPath;
                    prefix = (p1 + p2);
                    if (!prefix) prefix = "/";
                }
            }

            instance[$mountPath] = prefix;

            // Capture metadata for controller instance
            const info = getCallerInfo();
            (instance as any).metadata = {
                file: info.file,
                line: info.line,
                name: instance.constructor.name
            };

            this[$childControllers].push(instance as any);

            // Get Middleware for Controller
            // It could be on the Constructor (if passed as class) or Instance (if passed as object and manually set?)
            // Usually decorators set it on Constructor.
            const controllerMiddleware = (typeof controller === 'function' ? (controller as any)[$middleware] : (instance as any)[$middleware]) || [];

            // Get all method names from the prototype (for classes)
            const proto = Object.getPrototypeOf(instance);
            const methods = new Set<string>();

            // Scan prototype chain
            let current = proto;
            while (current && current !== Object.prototype) {
                Object.getOwnPropertyNames(current).forEach(name => methods.add(name));
                current = Object.getPrototypeOf(current);
            }
            // Also scan own properties (for objects or bound methods)
            Object.getOwnPropertyNames(instance).forEach(name => methods.add(name));

            const decoratedRoutes = (instance as any)[$routeMethods] || (proto && (proto as any)[$routeMethods]);
            const decoratedArgs = (instance as any)[$routeArgs] || (proto && (proto as any)[$routeArgs]);
            const methodMiddlewareMap = (instance as any)[$middleware] || (proto && (proto as any)[$middleware]);

            let routesAttached = 0;
            for (const name of methods) {
                if (name === "constructor") continue;
                if (["arguments", "caller", "callee"].includes(name)) continue;

                const originalHandler = (instance as any)[name];
                if (typeof originalHandler !== "function") continue;

                let method: Method | undefined;
                let subPath = "";

                // 1. Check for Decorator Metadata
                if (decoratedRoutes && decoratedRoutes.has(name)) {
                    const config = decoratedRoutes.get(name);
                    method = config.method;
                    subPath = config.path;
                }
                // 2. Fallback to Convention
                else {
                    // Simple convention matching
                    // Check if name starts with HTTP verb
                    for (const m of HTTPMethods) {
                        if (name.toUpperCase().startsWith(m)) {
                            method = m as Method;
                            const rest = name.slice(m.length);
                            if (rest.length === 0) {
                                subPath = "/";
                            }
                            else {
                                // Existing parsing logic...
                                subPath = "";
                                let buffer = "";
                                const flush = () => {
                                    if (buffer.length > 0) {
                                        subPath += "/" + buffer.toLowerCase();
                                        buffer = "";
                                    }
                                };
                                for (let i = 0; i < rest.length; i++) {
                                    const char = rest[i];
                                    if (char === "$") {
                                        flush();
                                        subPath += "/:";
                                        continue;
                                    }
                                    // Revised simple loop
                                }
                                subPath = rest
                                    .replace(/\$/g, "/:") // $id -> /:id
                                    .replace(/([a-z0-9])([A-Z])/g, "$1/$2") // camelCase -> camel/Case
                                    .toLowerCase();

                                if (!subPath.startsWith("/")) {
                                    subPath = "/" + subPath;
                                }
                            }
                            break;
                        }
                    }
                }

                if (method) {
                    routesAttached++;
                    // Remove trailing slash from prefix if needed, combine with subPath
                    const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
                    const cleanSubPath = subPath === "/" ? "" : subPath;

                    let joined: string;
                    if (cleanSubPath.length === 0) {
                        joined = cleanPrefix;
                    }
                    else if (cleanSubPath.startsWith("/")) {
                        joined = cleanPrefix + cleanSubPath;
                    }
                    else {
                        joined = cleanPrefix + "/" + cleanSubPath;
                    }

                    const fullPath = joined || "/";
                    const normalizedPath = fullPath.replace(/\/+/g, "/");

                    // -- Compose Handler with Middleware and Param Resolution --

                    const methodMw = (methodMiddlewareMap instanceof Map) ? (methodMiddlewareMap.get(name) || []) : [];
                    const allMiddleware = [...controllerMiddleware, ...methodMw];

                    // Check for Args
                    const routeArgs = decoratedArgs && decoratedArgs.get(name);

                    // Create Wrapper
                    const wrappedHandler = async (ctx: ShokupanContext<T>) => {
                        // Resolve Arguments
                        let args: any[] = [ctx]; // Default to just context if no decorators

                        if (routeArgs?.length > 0) {
                            args = [];
                            // Sort by index
                            const sortedArgs = [...routeArgs].sort((a, b) => a.index - b.index);

                            // Fill args array
                            for (const arg of sortedArgs) {
                                switch (arg.type) {
                                    case RouteParamType.BODY:
                                        args[arg.index] = await ctx.req.json().catch(() => ({}));
                                        break;
                                    case RouteParamType.PARAM:
                                        args[arg.index] = arg.name ? ctx.params[arg.name] : ctx.params;
                                        break;
                                    case RouteParamType.QUERY: {
                                        const url = new URL(ctx.req.url);
                                        args[arg.index] = arg.name ? url.searchParams.get(arg.name) : Object.fromEntries(url.searchParams);
                                        break;
                                    }
                                    case RouteParamType.HEADER:
                                        args[arg.index] = arg.name ? ctx.req.headers.get(arg.name) : ctx.req.headers;
                                        break;
                                    case RouteParamType.REQUEST:
                                        args[arg.index] = ctx.req;
                                        break;
                                    case RouteParamType.CONTEXT:
                                        args[arg.index] = ctx;
                                        break;
                                }
                            }
                        }

                        const tracedOriginalHandler = ctx.app?.applicationConfig.enableTracing
                            ? traceHandler(originalHandler, normalizedPath)
                            : originalHandler;
                        return tracedOriginalHandler.apply(instance, args);
                    };

                    // Apply Middleware wrapping
                    let finalHandler = wrappedHandler;
                    if (allMiddleware.length > 0) {
                        const composed = compose(allMiddleware);
                        finalHandler = async (ctx) => {
                            return composed(ctx, () => wrappedHandler(ctx));
                        };
                    }

                    // Expose original handler for OpenAPI analysis
                    (finalHandler as any).originalHandler = originalHandler;
                    if (finalHandler !== wrappedHandler) {
                        (wrappedHandler as any).originalHandler = originalHandler;
                    }

                    // Inject Controller Name as Tag
                    const tagName = instance.constructor.name;

                    // Retrieve @Spec metadata
                    const decoratedSpecs = (instance as any)[$routeSpec] || (proto && (proto as any)[$routeSpec]);
                    const userSpec = decoratedSpecs && decoratedSpecs.get(name);

                    // Merge with existing spec from decorator if available
                    const spec = { tags: [tagName], ...userSpec };

                    this.add({ method, path: normalizedPath, handler: finalHandler, spec });
                }
            }
            if (routesAttached === 0) {
                console.warn(`No routes attached to controller ${instance.constructor.name}`);
            }
            instance[$isMounted] = true;
        }

        return this;
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

        for (const child of this[$childRouters]) {
            const childRoutes = child.getRoutes();
            for (const route of childRoutes) {
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
     * Makes a sub request to this router.
     * This is useful for triggering other methods or route handlers. 
     * @param options The request options.
     * @returns The response.
     */
    public async subRequest(arg: {
        path: string;
        method?: Method;
        headers?: HeadersInit;
        body?: any;
    } | string): Promise<Response> {
        const options = typeof arg === "string" ? { path: arg } : arg;

        const store = asyncContext.getStore();
        const originalReq = store?.get("req") as ShokupanRequest<T>;

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
     * Processes a request directly.
     */
    public async processRequest(options: RequestOptions): Promise<ProcessResult> {
        let url = options.url || options.path || "/";
        if (!url.startsWith("http")) {
            const base = `http://${this.rootConfig?.hostname || "localhost"}:${this.rootConfig?.port || 3000}`;
            const path = url.startsWith("/") ? url : "/" + url;
            url = base + path;
        }

        // Handle query params in options
        if (options.query) {
            const u = new URL(url);
            for (const [k, v] of Object.entries(options.query)) {
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
        let status = 200;
        const headers: Record<string, string> = {};

        const match = this.find(req.method, ctx.path);
        if (match) {
            ctx.params = match.params;
            try {
                result = await match.handler(ctx);
            } catch (err: any) {
                console.error(err);
                status = err.status || err.statusCode || 500;
                result = { error: err.message || "Internal Server Error" };
                if (err.errors) result.errors = err.errors;
            }
        }
        else {
            status = 404;
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

    private applyHooks(match: { handler: ShokupanHandler<T>; params: Record<string, string>; }) {
        if (!this.config?.hooks) return match;
        const hooks = this.config.hooks;
        const hookList = Array.isArray(hooks) ? hooks : [hooks];

        // Optimize: Check if any relevant hooks are actually defined
        const hasStart = hookList.some(h => !!h.onRequestStart);
        const hasEnd = hookList.some(h => !!h.onRequestEnd);
        const hasError = hookList.some(h => !!h.onError);

        if (!hasStart && !hasEnd && !hasError) return match;
        const originalHandler = match.handler;

        match.handler = async (ctx: ShokupanContext<T>) => {
            if (hasStart) {
                for (let i = 0; i < hookList.length; i++) {
                    const h = hookList[i];
                    if (typeof h.onRequestStart === 'function') await h.onRequestStart(ctx);
                }
            }

            const debug = ctx._debug;
            let debugId: string | undefined;
            let previousNode: string | undefined;

            if (debug) {
                debugId = (originalHandler as any)._debugId || originalHandler.name || 'handler';
                previousNode = debug.getCurrentNode();
                debug.trackEdge(previousNode, debugId);
                debug.setNode(debugId);
            }

            const start = performance.now();
            try {
                const res = await originalHandler(ctx);
                debug?.trackStep(debugId, 'handler', performance.now() - start, 'success');

                for (let i = 0; i < hookList.length; i++) {
                    const h = hookList[i];
                    if (typeof h.onRequestEnd === 'function') await h.onRequestEnd(ctx);
                }
                return res;
            } catch (err) {
                debug?.trackStep(debugId, 'handler', performance.now() - start, 'error', err);

                for (let i = 0; i < hookList.length; i++) {
                    const h = hookList[i];
                    if (typeof h.onError === 'function') await h.onError(err, ctx);
                }
                throw err;
            } finally {
                if (debug && previousNode) debug.setNode(previousNode);
            }
        };
        // Preserve original handler reference for analysis if needed
        (match.handler as any).originalHandler = (originalHandler as any).originalHandler ?? originalHandler;

        return match;
    }

    /**
     * Find a route matching the given method and path.
     * @param method HTTP method
     * @param path Request path
     * @returns Route handler and parameters if found, otherwise null
     */
    public find(method: string, path: string): { handler: ShokupanHandler<T>; params: Record<string, string>; } | null {
        // console.log(`[Router] find ${method} ${path} (routes: ${this.routes.length}, children: ${this[$childRouters].length})`);


        // Helper to search specific routes
        const findInRoutes = (routes: any[], m: string) => {
            for (const route of routes) {
                if (route.method !== "ALL" && route.method !== m) continue;
                const match = route.regex.exec(path);
                if (match) {
                    const params: Record<string, string> = {};
                    route.keys.forEach((key: string, index: number) => {
                        params[key] = match[index + 1];
                    });
                    return this.applyHooks({ handler: route.handler, params });
                }
            }
            return null;
        };

        // 1. Check local routes
        let result = findInRoutes(this[$routes], method);
        if (result) return result;

        // Fallback: If HEAD not found, try GET
        if (method === "HEAD") {
            result = findInRoutes(this[$routes], "GET");
            if (result) return result;
        }

        // 2. Check child routers
        for (const child of this[$childRouters]) {
            const prefix = child[$mountPath];
            // console.log(`  -> Checking child prefix ${prefix}`);

            if (path === prefix || path.startsWith(prefix + "/")) {
                const subPath = path.slice(prefix.length) || "/";
                const match = child.find(method, subPath);
                if (match) return this.applyHooks(match);
            }
            // Handle case where prefix ends with /
            if (prefix.endsWith("/")) {
                if (path.startsWith(prefix)) {
                    const subPath = path.slice(prefix.length) || "/";
                    const match = child.find(method, subPath);
                    if (match) return this.applyHooks(match);
                }
            }
        }

        return null; // Not found
    }

    private parsePath(path: string): { regex: RegExp; keys: string[]; } {
        const keys: string[] = [];
        const pattern = path
            .replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
                keys.push(key);
                return "([^/]+)";
            })
            .replace(/\*/g, ".*"); // Wildcard support

        return {
            regex: new RegExp(`^${pattern}$`),
            keys
        };
    }

    // --- Functional Routing ---

    public requestTimeout?: number;

    /**
     * Adds a route to the router.
     * 
     * @param method - HTTP method
     * @param path - URL path
     * @param spec - OpenAPI specification for the route
     * @param handler - Route handler function
     * @param requestTimeout - Timeout for this route in milliseconds
     */
    public add({ method, path, spec, handler, regex: customRegex, group, requestTimeout, renderer }: {
        method: Method,
        path: string,
        spec?: MethodAPISpec,
        handler: ShokupanHandler<T>;
        regex?: RegExp;
        group?: string;
        requestTimeout?: number;
        renderer?: JSXRenderer;
    }) {
        const { regex, keys } = customRegex
            ? { regex: customRegex, keys: [] }
            : this.parsePath(path);

        // Wrap handler with current guards if any exist
        let wrappedHandler = handler;
        const routeGuards = [...this.currentGuards];

        // Wrap for Timeout
        const effectiveTimeout = requestTimeout ?? this.requestTimeout ?? this.rootConfig?.requestTimeout;

        if (effectiveTimeout !== undefined && effectiveTimeout > 0) {
            const originalHandler = wrappedHandler;
            wrappedHandler = async (ctx: ShokupanContext<T>) => {
                if (ctx.server) {
                    ctx.server.timeout(ctx.req as unknown as Request, effectiveTimeout / 1000);
                }
                return originalHandler(ctx);
            };
            (wrappedHandler as any).originalHandler = (originalHandler as any).originalHandler || originalHandler;
        }

        if (routeGuards.length > 0) {
            const innerHandler = wrappedHandler;
            wrappedHandler = async (ctx: ShokupanContext<T>) => {
                // Execute guards in order
                for (const guard of routeGuards) {
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
                return innerHandler(ctx);
            };
        }

        // Inject Renderer
        const effectiveRenderer = renderer ?? this.config?.renderer ?? this.rootConfig?.renderer;
        if (effectiveRenderer) {
            const innerHandler = wrappedHandler;
            wrappedHandler = async (ctx: ShokupanContext<T>) => {
                ctx.renderer = effectiveRenderer;
                return innerHandler(ctx);
            };
        }

        // --- Middleware Tracking Logic ---
        const { file, line } = getCallerInfo();

        const trackingHandler = wrappedHandler;
        wrappedHandler = async (ctx: ShokupanContext<T>) => {
            if (ctx.app?.applicationConfig.enableMiddlewareTracking) {
                ctx.handlerStack.push({
                    name: handler.name || 'anonymous',
                    file,
                    line
                });
            }
            return trackingHandler(ctx);
        };
        (wrappedHandler as any).originalHandler = (trackingHandler as any).originalHandler || trackingHandler;
        // ---------------------------------

        this[$routes].push({
            method,
            path,
            regex,
            keys,
            handler: wrappedHandler,
            handlerSpec: spec,
            group,
            guards: routeGuards.length > 0 ? routeGuards : undefined,
            requestTimeout: effectiveTimeout,
            metadata: {
                file,
                line,
                name: handler.name || 'anonymous',
                isBuiltin: (handler as any).isBuiltin,
                pluginName: (handler as any).pluginName
            }
        });

        return this;
    }

    /**
     * Adds a GET route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public get(path: string, ...handlers: ShokupanHandler<T>[]);
    /**
     * Adds a GET route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public get(path: string, spec: MethodAPISpec, ...handlers: ShokupanHandler<T>[]);
    public get(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("GET", path, ...args);
        return this;
    }

    /**
     * Adds a POST route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public post(path: string, ...handlers: ShokupanHandler<T>[]);
    /**
     * Adds a POST route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public post(path: string, spec: MethodAPISpec, ...handlers: ShokupanHandler<T>[]);
    public post(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("POST", path, ...args);
        return this;
    }

    /**
     * Adds a PUT route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public put(path: string, ...handlers: ShokupanHandler<T>[]);
    /**
     * Adds a PUT route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public put(path: string, spec: MethodAPISpec, ...handlers: ShokupanHandler<T>[]);
    public put(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("PUT", path, ...args);
        return this;
    }

    /**
     * Adds a DELETE route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public delete(path: string, ...handlers: ShokupanHandler<T>[]);
    /**
     * Adds a DELETE route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public delete(path: string, spec: MethodAPISpec, ...handlers: ShokupanHandler<T>[]);
    public delete(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("DELETE", path, ...args);
        return this;
    }

    /**
     * Adds a PATCH route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public patch(path: string, ...handlers: ShokupanHandler<T>[]);
    /**
     * Adds a PATCH route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public patch(path: string, spec: MethodAPISpec, ...handlers: ShokupanHandler<T>[]);
    public patch(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("PATCH", path, ...args);
        return this;
    }

    /**
     * Adds a OPTIONS route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public options(path: string, ...handlers: ShokupanHandler<T>[]);
    /**
     * Adds a OPTIONS route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public options(path: string, spec: MethodAPISpec, ...handlers: ShokupanHandler<T>[]);
    public options(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("OPTIONS", path, ...args);
        return this;
    }

    /**
     * Adds a HEAD route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public head(path: string, ...handlers: ShokupanHandler<T>[]);
    /**
     * Adds a HEAD route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public head(path: string, spec: MethodAPISpec, ...handlers: ShokupanHandler<T>[]);
    public head(path: string, ...args: (MethodAPISpec | ShokupanHandler<T>)[]) {
        this.attachVerb("HEAD", path, ...args);
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
                const match = callerLine.match(/\((.*):(\d+):(\d+)\)/) || callerLine.match(/at (.*):(\d+):(\d+)/);
                if (match) {
                    file = match[1];
                    line = parseInt(match[2], 10);
                }
            }
        } catch (e) { }

        const trackedGuard = async (ctx: ShokupanContext<T>, next?: any) => {
            if (ctx.app?.applicationConfig.enableMiddlewareTracking) {
                ctx.handlerStack.push({
                    name: guardHandler.name || 'guard',
                    file,
                    line
                });
            }
            return guardHandler(ctx, next);
        };
        (trackedGuard as any).originalHandler = (guardHandler as any).originalHandler || guardHandler;
        // ---------------------------------

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

        let finalHandler = handlers[handlers.length - 1]; // Last handler is the main handler?
        // Wait, compose logic: 
        // If we have [m1, m2, h], we want m1 -> m2 -> h.
        // compose([m1, m2, h]) does exactly that.
        // However, middleware returns `Promise<any>`.
        // If `handlers.length > 1`, we wrap them.

        if (handlers.length > 1) {
            // Since handlers are [ctx, next?], they fit Strict Middleware signature.
            // compose takes Middleware[].
            // We assume ALL provided handlers are valid middleware/handlers.
            const fn = compose(handlers as any);
            finalHandler = (ctx) => fn(ctx);
        }

        // if (spec) {
        //     console.log(`[Router] attachVerb ${method} ${path} has spec:`, spec);
        // } 
        // else {
        //     console.log(`[Router] attachVerb ${method} ${path} NO SPEC`);
        // }

        this.add({
            method,
            path,
            spec,
            handler: finalHandler
        });
    }

    /**
     * Generates an OpenAPI 3.1 Document by recursing through the router and its descendants.
     * Now includes runtime analysis of handler functions to infer request/response types.
     */
    public generateApiSpec(options: OpenAPIOptions = {}): any {
        return generateOpenApi(this, options);
    }
}
