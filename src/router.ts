
import { ConvectionContext } from './context';
import type { Convection } from './convect';
import { ConvectionRequest } from './request';
import { $appRoot, $childControllers, $childRouters, $dispatch, $isApplication, $isMounted, $isRouter, $mountPath, $parent } from './symbol';
import type { ConvectionRouteConfig, MethodAPISpec, ProcessResult, RequestOptions } from './types';
import { HTTPMethods, type ConvectionController, type ConvectionHandler, type ConvectionRoute, type Method } from './types';

// Shim for HeadersInit if not available globally
type HeadersInit = Headers | Record<string, string> | [string, string][];

export const RouterRegistry = new Map<string, ConvectionRouter<any>>();

export const ConvectionApplicationTree = {};

export class ConvectionRouter<T> {
    // Internal marker to identify Router vs. Application
    private [$isApplication]: boolean = false;
    private [$isMounted]: boolean = false;
    private [$isRouter]: true = true;
    private [$appRoot]: Convection;
    private [$mountPath]: string = "/";

    private [$parent]: ConvectionRouter<T> | null = null;
    public [$childRouters]: ConvectionRouter<T>[] = [];
    public [$childControllers]: ConvectionController[] = [];

    get rootConfig() {
        return this[$appRoot]?.applicationConfig;
    }
    get root() {
        return this[$appRoot];
    }

    private routes: ConvectionRoute[] = [];

    constructor(
        private readonly config?: ConvectionRouteConfig
    ) {
    }

    private isRouterInstance(target: ConvectionController | ConvectionRouter<T>): target is ConvectionRouter<T> {
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
    public mount(prefix: string, controller: ConvectionController | ConvectionRouter<T>) {

        if (this.isRouterInstance(controller)) {
            if (controller[$isMounted]) {
                throw new Error("Router is already mounted");
            }

            controller[$mountPath] = prefix;
            this[$childRouters].push(controller);

            /**
             * Descendants are defined first, then mounted backwards up to the application root.
             * Thus, we have to recurse through the children and assign the root reference.
             */
            controller[$parent] = this;

            const setRouterContext = (router: ConvectionRouter<T>) => {
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
            // If controller is a class constructor, instantiate it
            if (typeof controller === 'function') {
                // @ts-ignore
                controller = new controller();
            }

            // @ts-ignore
            controller[$mountPath] = prefix;
            this[$childControllers].push(controller as any);

            // Get all method names from the prototype (for classes)
            const proto = Object.getPrototypeOf(controller);
            const methods = new Set<string>();

            // Scan prototype chain
            let current = proto;
            while (current && current !== Object.prototype) {
                Object.getOwnPropertyNames(current).forEach(name => methods.add(name));
                current = Object.getPrototypeOf(current);
            }
            // Also scan own properties (for objects or bound methods)
            Object.getOwnPropertyNames(controller).forEach(name => methods.add(name));

            let routesAttached = 0;
            for (const name of methods) {
                if (name === "constructor") continue;
                if (["arguments", "caller", "callee"].includes(name)) continue;

                const handler = controller[name];
                if (typeof handler !== "function") continue;

                // Simple convention matching
                let method: Method | undefined;
                let subPath = "";

                // Check if name starts with HTTP verb
                for (const m of HTTPMethods) {
                    if (name.toUpperCase().startsWith(m)) {
                        method = m;
                        // Extract remaining part as path
                        // e.g. getUsers -> Users
                        // e.g. get -> ""
                        const rest = name.slice(m.length);
                        if (rest.length === 0) {
                            subPath = "/";
                        }
                        else {
                            // Parse "RestOfMethodName" -> "/rest/of/method/name"
                            // Parse "$id" -> "/:id"
                            // Parse "$idProfile" -> "/:id/profile"

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
                                    // Start parameter
                                    // e.g. $id -> /:id
                                    // Look ahead for parameter name
                                    // Convention: $paramName ends at next Uppercase or end
                                    subPath += "/:";
                                    continue;
                                }
                                // Revised simple loop
                            }

                            // Let's use regex replace sequence
                            subPath = rest
                                .replace(/\$/g, "/:") // $id -> /:id
                                .replace(/([a-z0-9])([A-Z])/g, "$1/$2") // camelCase -> camel/Case
                                .toLowerCase();

                            // Ensure it starts with / (if not already from $ or replace)
                            if (!subPath.startsWith("/")) {
                                subPath = "/" + subPath;
                            }
                        }
                        break;
                    }
                }

                if (method) {
                    routesAttached++;
                    // Remove trailing slash from prefix if needed, combine with subPath
                    const cleanPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
                    const cleanSubPath = subPath === "/" ? "" : subPath;
                    const fullPath = (cleanPrefix + cleanSubPath) || "/";

                    this.add({ method, path: fullPath, handler: handler.bind(controller) });
                }
            }
            if (routesAttached === 0) {
                console.warn(`No routes attached to controller ${controller.constructor.name}`);
            }
            controller[$isMounted] = true;
        }
    }

    /**
     * Returns all routes attached to this router and its descendants.
     */
    public getRoutes(): { method: string, path: string, handler: ConvectionHandler; }[] {
        const routes = this.routes.map(r => ({
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
                    method: route.method,
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
    public async subRequest(options: {
        path: string;
        method?: Method;
        headers?: HeadersInit;
        body?: any;
    }): Promise<Response> {
        let url = options.path;
        // If path is relative, make it absolute (required by Request constructor)
        if (!url.startsWith("http")) {
            const base = `http://${this.rootConfig?.hostname || "localhost"}:${this.rootConfig.port || 3000}`;

            // Ensure path starts with /
            const path = url.startsWith("/") ? url : "/" + url;
            url = base + path;
        }

        const req = new ConvectionRequest({
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

        const req = new ConvectionRequest({
            method: options.method || "GET",
            url,
            headers: options.headers as any,
            body: options.body && typeof options.body === "object" ? JSON.stringify(options.body) : options.body
        });

        // Basic Dispatch Logic (moved/duplicated from Convection.handleRequest but simpler for pure Router)
        // Note: Pure Routers don't have global middleware usually, but if we call processRequest on them, 
        // we just run their routing logic.
        // HOWEVER, Convection.override will invoke middleware.

        const ctx = new ConvectionContext(req);

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
                status = 500;
                result = { error: "Internal Server Error", message: err.message };
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

    public find(method: string, path: string): { handler: ConvectionHandler; params: Record<string, string>; } | null {
        // console.log(`[Router] find ${method} ${path} (routes: ${this.routes.length}, children: ${this[$childRouters].length})`);

        // 1. Check local routes
        for (const route of this.routes) {
            if (route.method !== "ALL" && route.method !== method) continue;

            const match = route.regex.exec(path);
            if (match) {
                // console.log(`  -> Matched route ${route.path}`);
                const params: Record<string, string> = {};
                route.keys.forEach((key, index) => {
                    params[key] = match[index + 1];
                });
                return { handler: route.handler, params };
            }
        }

        // 2. Check child routers
        for (const child of this[$childRouters]) {
            const prefix = child[$mountPath];
            // console.log(`  -> Checking child prefix ${prefix}`);

            if (path === prefix || path.startsWith(prefix + "/")) {
                const subPath = path.slice(prefix.length) || "/";
                const match = child.find(method, subPath);
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

    // --- Helpers ---

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

    /**
     * Adds a route to the router.
     * 
     * @param method - HTTP method
     * @param path - URL path
     * @param spec - OpenAPI specification for the route
     * @param handler - Route handler function
     */
    public add({ method, path, spec, handler }: {
        method: Method,
        path: string,
        spec?: MethodAPISpec,
        handler: ConvectionHandler;
    }) {

        const { regex, keys } = this.parsePath(path);
        this.routes.push({ method, path, regex, keys, handler });
    }

    /**
     * Adds a GET route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public get(path: string, handler: ConvectionHandler);
    /**
     * Adds a GET route to the router.
     
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handler - Route handler function 
     */
    public get(path: string, spec: MethodAPISpec, handler: ConvectionHandler);
    public get(path: string, specOrHandler: MethodAPISpec | ConvectionHandler, handler?: ConvectionHandler) {
        this.attachVerb("GET", path, specOrHandler, handler);
    }

    /**
     * Adds a POST route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public post(path: string, handler: ConvectionHandler);
    /**
     * Adds a POST route to the router.
     
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handler - Route handler function 
     */
    public post(path: string, spec: MethodAPISpec, handler: ConvectionHandler);
    public post(path: string, specOrHandler: MethodAPISpec | ConvectionHandler, handler?: ConvectionHandler) {
        this.attachVerb("POST", path, specOrHandler, handler);
    }

    /**
     * Adds a PUT route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public put(path: string, handler: ConvectionHandler);
    /**
     * Adds a PUT route to the router.
     
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handler - Route handler function 
     */
    public put(path: string, spec: MethodAPISpec, handler: ConvectionHandler);
    public put(path: string, specOrHandler: MethodAPISpec | ConvectionHandler, handler?: ConvectionHandler) {
        this.attachVerb("PUT", path, specOrHandler, handler);
    }

    /**
     * Adds a DELETE route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public delete(path: string, handler: ConvectionHandler);
    /**
     * Adds a DELETE route to the router.
     
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handler - Route handler function 
     */
    public delete(path: string, spec: MethodAPISpec, handler: ConvectionHandler);
    public delete(path: string, specOrHandler: MethodAPISpec | ConvectionHandler, handler?: ConvectionHandler) {
        this.attachVerb("DELETE", path, specOrHandler, handler);
    }

    /**
     * Adds a PATCH route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public patch(path: string, handler: ConvectionHandler);
    /**
     * Adds a PATCH route to the router.
     
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handler - Route handler function 
     */
    public patch(path: string, spec: MethodAPISpec, handler: ConvectionHandler);
    public patch(path: string, specOrHandler: MethodAPISpec | ConvectionHandler, handler?: ConvectionHandler) {
        this.attachVerb("PATCH", path, specOrHandler, handler);
    }

    /**
     * Adds a OPTIONS route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public options(path: string, handler: ConvectionHandler);
    /**
     * Adds a OPTIONS route to the router.
     
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handler - Route handler function 
     */
    public options(path: string, spec: MethodAPISpec, handler: ConvectionHandler);
    public options(path: string, specOrHandler: MethodAPISpec | ConvectionHandler, handler?: ConvectionHandler) {
        this.attachVerb("OPTIONS", path, specOrHandler, handler);
    }

    /**
     * Adds a HEAD route to the router.
     * 
     * @param path - URL path    
     * @param handler - Route handler function 
     */
    public head(path: string, handler: ConvectionHandler);
    /**
     * Adds a HEAD route to the router.
     
     * @param path - URL path    
     * @param spec - OpenAPI specification for the route
     * @param handler - Route handler function 
     */
    public head(path: string, spec: MethodAPISpec, handler: ConvectionHandler);
    public head(path: string, specOrHandler: MethodAPISpec | ConvectionHandler, handler?: ConvectionHandler) {
        this.attachVerb("HEAD", path, specOrHandler, handler);
    }

    /**
     * Simple method to actually attach the verb routes with their overload signatures
     */
    private attachVerb(method: string, path: string, specOrHandler: MethodAPISpec | ConvectionHandler, handlerFn?: ConvectionHandler) {
        const spec = typeof specOrHandler === "function" ? null : specOrHandler as MethodAPISpec;
        const handler = typeof specOrHandler === "function" ? specOrHandler as ConvectionHandler : handlerFn as ConvectionHandler;

        this.add({
            method,
            path,
            spec,
            handler
        });
    }
}
