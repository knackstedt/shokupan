import { ShokupanContext } from './context';
import { Container } from './di';
import { compose } from './middleware';
import { generateOpenApi } from './plugins/openapi';
import { serveStatic } from './plugins/serve-static';
import { ShokupanRequest } from './request';
import { RouterTrie } from './router/trie';
import type { Shokupan } from './shokupan';
import { $appRoot, $childControllers, $childRouters, $controllerPath, $dispatch, $isApplication, $isMounted, $isRouter, $middleware, $mountPath, $parent, $routeArgs, $routeMethods, $routes, $routeSpec } from './symbol';

import { type GuardAPISpec, HTTPMethods, type JSXRenderer, type Method, type MethodAPISpec, type Middleware, type OpenAPIOptions, type ProcessResult, type RequestOptions, type RouteMetadata, type RouteParams, RouteParamType, type ShokupanController, type ShokupanHandler, type ShokupanHooks, type ShokupanRoute, type ShokupanRouteConfig, type StaticServeOptions } from './types';
import { asyncContext } from './util/async-hooks';
import { datastore } from './util/datastore';
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

    private hookCache = new Map<keyof ShokupanHooks, Function[]>();
    private hooksInitialized: boolean = false;

    public middleware: Middleware[] = [];

    get rootConfig() {
        return this[$appRoot]?.applicationConfig;
    }
    get root() {
        return this[$appRoot];
    }

    public [$routes]: ShokupanRoute[] = []; // Public via Symbol for OpenAPI generator
    private trie = new RouterTrie<T>();
    public metadata?: RouteMetadata; // Metadata for the router itself

    private currentGuards: { handler: ShokupanHandler<T>; spec?: GuardAPISpec; }[] = [];

    // Registry Accessor
    public getComponentRegistry(): {
        metadata: RouteMetadata,
        middleware: { name: string, metadata: RouteMetadata, order: number, _fn: Middleware; }[],
        routes: { type: 'route', path: string, method: Method, metadata: RouteMetadata, handlerName: string, tags: string[], order: number, _fn: ShokupanHandler<T>; }[],
        routers: { type: 'router', path: string, metadata: RouteMetadata, children: { routes: any[]; }; }[],
        controllers: { type: 'controller', path: string, name: string, metadata: RouteMetadata; children: { routes: any[]; }; }[];
    } {
        // Separation logic: Group routes by controller instance
        const controllerRoutesMap = new Map<any, any[]>();
        const localRoutes: any[] = [];

        for (let i = 0; i < this[$routes].length; i++) {
            const r = this[$routes][i];
            const entry = {
                type: 'route' as 'route',
                path: r.path,
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
            path: r[$mountPath],
            metadata: r.metadata,
            children: r.getComponentRegistry()
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

        return {
            metadata: this.metadata,
            middleware,
            routes: localRoutes,
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
            for (let i = 0; i < Array.from(methods).length; i++) {
                const name = Array.from(methods)[i];
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
                    for (let j = 0; j < HTTPMethods.length; j++) {
                        const m = HTTPMethods[j];
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
                            for (let k = 0; k < sortedArgs.length; k++) {
                                const arg = sortedArgs[k];
                                switch (arg.type) {
                                    case RouteParamType.BODY:
                                        try {
                                            if (ctx.req.headers.get("content-type")?.includes("application/json")) {
                                                args[arg.index] = await ctx.req.json();
                                            } else {
                                                // Fallback or empty if not JSON? 
                                                // If @Body is used, valid JSON is expected.
                                                // If empty body, json() throws.
                                                const text = await ctx.req.text();
                                                if (!text) {
                                                    args[arg.index] = {};
                                                } else {
                                                    args[arg.index] = JSON.parse(text);
                                                }
                                            }
                                        } catch (e) {
                                            const err: any = new Error("Invalid JSON body");
                                            err.status = 400;
                                            throw err;
                                        }
                                        break;
                                    case RouteParamType.PARAM:
                                        args[arg.index] = arg.name ? ctx.params[arg.name] : ctx.params;
                                        break;
                                    case RouteParamType.QUERY: {
                                        const url = new URL(ctx.req.url);
                                        if (arg.name) {
                                            const vals = url.searchParams.getAll(arg.name);
                                            args[arg.index] = vals.length > 1 ? vals : vals[0];
                                        } else {
                                            const query: Record<string, any> = {};
                                            const keys = Object.keys(url.searchParams);
                                            for (let k = 0; k < keys.length; k++) {
                                                const key = keys[k];
                                                const vals = url.searchParams.getAll(key);
                                                query[key] = vals.length > 1 ? vals : vals[0];
                                            }
                                            args[arg.index] = query;
                                        }
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

                    this.add({ method, path: normalizedPath, handler: finalHandler, spec, controller: instance });
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

            const debug = ctx._debug;
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

    /**
     * Find a route matching the given method and path.
     * @param method HTTP method
     * @param path Request path
     * @returns Route handler and parameters if found, otherwise null
     */
    public find(method: string, path: string): { handler: ShokupanHandler<T>; params: Record<string, string>; } | null {
        // console.log(`[Router] find ${method} ${path} (routes: ${this.routes.length}, children: ${this[$childRouters].length})`);


        // 1. Check local routes
        let result = this.trie.search(method, path);
        if (result) return result;

        // Fallback: If HEAD not found, try GET
        if (method === "HEAD") {
            result = this.trie.search("GET", path);
            if (result) return result;
        }

        // 2. Check child routers
        for (let i = 0; i < this[$childRouters].length; i++) {
            const child = this[$childRouters][i];
            const prefix = child[$mountPath];

            if (path === prefix || path.startsWith(prefix + "/")) {
                const subPath = path.slice(prefix.length) || "/";
                const match = child.find(method, subPath);
                // Child router handlers are already wrapped with child hooks
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
        const keys: string[] = [];
        const pattern = path
            .replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
                keys.push(key);
                return "([^/]+)";
            })
            .replace(/\*\*/g, ".*")   // Recursive wildcard
            .replace(/\*/g, "[^/]+"); // Single segment wildcard

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
    public add({ method, path, spec, handler, regex: customRegex, group, requestTimeout, renderer, controller }: {
        method: Method,
        path: string,
        spec?: MethodAPISpec,
        handler: ShokupanHandler<T>;
        regex?: RegExp;
        group?: string;
        requestTimeout?: number;
        renderer?: JSXRenderer;
        controller?: any;
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
            // Optimization: Skip all tracking overhead if disabled
            if (!ctx.app?.applicationConfig.enableMiddlewareTracking) {
                return trackingHandler(ctx);
            }

            const startTime = performance.now();
            let error: any = undefined;

            try {
                if (ctx.app?.applicationConfig.enableMiddlewareTracking) {
                    ctx.handlerStack.push({
                        name: handler.name || 'anonymous',
                        file,
                        line
                    });
                }
                return await trackingHandler(ctx);
            } catch (e) {
                error = e;
                throw e; // Bubble up to error hook
            } finally {
                // Store in datastore after execution (non-blocking)
                if (ctx.app?.applicationConfig.enableMiddlewareTracking) {
                    const duration = performance.now() - startTime;
                    const config = ctx.app.applicationConfig;

                    // Execute datastore operations in background without blocking response
                    Promise.resolve().then(async () => {
                        try {
                            const timestamp = Date.now();
                            const key = `${timestamp}-${handler.name || 'anonymous'}-${Math.random().toString(36).substring(7)}`;

                            await datastore.set('middleware_tracking', key, {
                                name: handler.name || 'anonymous',
                                path: ctx.path,
                                timestamp,
                                duration,
                                file,
                                line,
                                error: error ? String(error) : undefined,
                                metadata: {
                                    isBuiltin: (handler as any).isBuiltin,
                                    pluginName: (handler as any).pluginName
                                }
                            });

                            // Cleanup old entries based on TTL and capacity
                            const ttl = config.middlewareTrackingTTL ?? 86400000; // 1 day default
                            const maxCapacity = config.middlewareTrackingMaxCapacity ?? 10000;
                            const cutoff = Date.now() - ttl;

                            // Delete entries older than TTL
                            await datastore.query(`DELETE middleware_tracking WHERE timestamp < ${cutoff}`);

                            // Enforce capacity limit
                            const results = await datastore.query('SELECT count() FROM middleware_tracking GROUP ALL');
                            if (results && results[0] && results[0].count > maxCapacity) {
                                const toDelete = results[0].count - maxCapacity;
                                await datastore.query(`DELETE middleware_tracking ORDER BY timestamp ASC LIMIT ${toDelete}`);
                            }
                        } catch (datastoreError) {
                            // Silently fail datastore operations to not break request flow
                            console.error('Failed to store middleware tracking:', datastoreError);
                        }
                    });
                }
            }
        };
        (wrappedHandler as any).originalHandler = (trackingHandler as any).originalHandler || trackingHandler;

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
            controller
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
    public get<Path extends string>(path: Path, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a GET route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public get<Path extends string>(path: Path, spec: MethodAPISpec, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
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
    public post<Path extends string>(path: Path, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a POST route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public post<Path extends string>(path: Path, spec: MethodAPISpec, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
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
    public put<Path extends string>(path: Path, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a PUT route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public put<Path extends string>(path: Path, spec: MethodAPISpec, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
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
    public delete<Path extends string>(path: Path, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a DELETE route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public delete<Path extends string>(path: Path, spec: MethodAPISpec, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
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
    public patch<Path extends string>(path: Path, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a PATCH route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public patch<Path extends string>(path: Path, spec: MethodAPISpec, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
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
    public options<Path extends string>(path: Path, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a OPTIONS route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public options<Path extends string>(path: Path, spec: MethodAPISpec, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
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
    public head<Path extends string>(path: Path, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
    /**
     * Adds a HEAD route to the router.
     * 
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handlers - Route handler functions 
     */
    public head<Path extends string>(path: Path, spec: MethodAPISpec, ...handlers: ShokupanHandler<T, RouteParams<Path>>[]);
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
                    this.hookCache.set(type, fns);
                }
            }
        }
        this.hooksInitialized = true;
    }

    public async runHooks(name: keyof ShokupanHooks, ...args: any[]) {
        // Optimization: Use hasHook check before calling this usually
        // But we ensure initialized here too just in case
        if (!this.hooksInitialized) {
            this.ensureHooksInitialized();
        }
        const fns = this.hookCache.get(name);
        if (!fns) return;

        // Check if debug tracking is enabled (ctx is typically the first argument for most hooks)
        const ctx = args?.[0] instanceof ShokupanContext ? args[0] : undefined;
        const debug = ctx?._debug;

        if (debug) {
            // Track each hook individually with debug timing
            await Promise.all(fns.map(async (fn, index) => {
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
            await Promise.all(fns.map(fn => fn(...args)));
        }
    }
}
