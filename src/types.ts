import type { OpenAPI } from '@scalar/openapi-types';
import type { Server } from 'bun';
import type { ShokupanContext } from './context';
import { $isRouter } from "./symbol";

export type DeepPartial<T> = T extends Function ? T : T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;

export interface RouteMetadata {
    file: string;
    line: number;
    name?: string;
    isBuiltin?: boolean;
    pluginName?: string;
}

export type MethodAPISpec = OpenAPI.Operation;
export type GuardAPISpec = DeepPartial<OpenAPI.Operation>;
export type RouterAPISpec = OpenAPI.Operation & Pick<Required<OpenAPI.Operation>, 'tags'> & { group: string; };

export interface OpenAPIOptions {
    info?: OpenAPI.Document['info'];
    servers?: OpenAPI.Document['servers'];
    components?: OpenAPI.Document['components'];
    tags?: OpenAPI.Document['tags'];
    externalDocs?: OpenAPI.Document['externalDocs'];
    defaultTagGroup?: string;
    defaultTag?: string;
}

export interface ShokupanHooks<T = any> {
    onError?: (error: unknown, ctx: ShokupanContext<T>) => void | Promise<void>;
    onRequestStart?: (ctx: ShokupanContext<T>) => void | Promise<void>;
    onRequestEnd?: (ctx: ShokupanContext<T>) => void | Promise<void>;
    onResponseStart?: (ctx: ShokupanContext<T>, response: Response) => void | Promise<void>;
    onResponseEnd?: (ctx: ShokupanContext<T>, response: Response) => void | Promise<void>;
    beforeValidate?: (ctx: ShokupanContext<T>, data: any) => void | Promise<void>;
    afterValidate?: (ctx: ShokupanContext<T>, data: any) => void | Promise<void>;
    onReadTimeout?: (ctx: ShokupanContext<T>) => void | Promise<void>;
    onWriteTimeout?: (ctx: ShokupanContext<T>) => void | Promise<void>;
    onRequestTimeout?: (ctx: ShokupanContext<T>) => void | Promise<void>;
}

export interface CookieOptions {
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    domain?: string;
    path?: string;
    sameSite?: boolean | 'lax' | 'strict' | 'none' | 'Lax' | 'Strict' | 'None';
    priority?: 'low' | 'medium' | 'high' | 'Low' | 'Medium' | 'High';
}


export type ShokupanHandler<T extends Record<string, any> = Record<string, any>> = (ctx: ShokupanContext<T>, next?: NextFn) => Promise<any> | any;
export const HTTPMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "ALL"];
export type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD" | "ALL";

export enum RouteParamType {
    BODY = "BODY",
    PARAM = "PARAM",
    QUERY = "QUERY",
    HEADER = "HEADER",
    REQUEST = "REQUEST",
    CONTEXT = "CONTEXT"
}

export interface ServerFactory {
    (options: any): Server<any> | Promise<Server<any>>;
}

export type NextFn = () => Promise<any>;
export type Middleware = ((ctx: ShokupanContext<unknown>, next: NextFn) => Promise<any> | any) & {
    isBuiltin?: boolean;
    pluginName?: string;
    metadata?: RouteMetadata;
    order?: number;
};
export type JSXRenderer = (element: any, args?: unknown) => string | Promise<string>;

export type ShokupanRouteConfig = DeepPartial<{
    name: string;
    group: string;
    /**
     * Timeout for this specific route (milliseconds).
     */
    requestTimeout: number;
    openapi: DeepPartial<OpenAPI.Operation>;
    /**
     * Custom renderer for this route.
     */
    renderer: JSXRenderer;

    /**
     * Hooks for this route/router.
     */
    hooks: ShokupanHooks | ShokupanHooks[];
    /**
     * Whether to enforce that only controller classes (constructors) are accepted by the router.
     */
    controllersOnly: boolean;

    /**
     * Whether to enable automatic backpressure based on system CPU load.
     */
    autoBackpressureFeedback: boolean;
    /**
     * The CPU usage percentage threshold (0-100) at which to start rejecting requests.
     */
    autoBackpressureLevel: number;
}>;

export type ShokupanRoute = {
    /**
     * HTTP method
     */
    method: Method;
    /**
     * Route path
     */
    path: string;
    /**
     * Compiled regex for the route
     */
    regex: RegExp;
    /**
     * Route parameters
     */
    keys: string[];
    /**
     * Route handler
     */
    handler: ShokupanHandler;
    /**
     * OpenAPI spec for the route
     */
    handlerSpec?: MethodAPISpec;
    /**
     * Group for the route
     */
    group?: string;
    /**
     * Guards for the route
     */
    guards?: {
        /**
         * Guard handler
         */
        handler: ShokupanHandler;
        /**
         * Guard OpenAPI spec
         */
        spec?: GuardAPISpec;
    }[];
    /**
     * Timeout for this specific route (milliseconds).
     */
    requestTimeout?: number;
    /**
     * Custom JSX renderer for this route.
     */
    renderer?: JSXRenderer;
    /**
     * Hooks from the router/route definition
     */
    hooks?: ShokupanHooks;
    /**
     * Source metadata
     */
    metadata?: RouteMetadata;
    /**
     * Order of the middleware
     */
    order?: number;
};

export type ShokupanConfig<T extends Record<string, any> = Record<string, any>> = DeepPartial<{
    /**
     * The port to be used for the server.
     * @default 3000
     */
    port: number;
    /**
     * The hostname to be used for the server.
     * @default "localhost"
     */
    hostname: string;
    /**
     * Whether to run in development mode.
     * @default process.env.NODE_ENV !== "production"
     */
    development: boolean;
    /**
     * Whether to enable AsyncLocalStorage.
     * (Request local storage)
     * @default false
     */
    enableAsyncLocalStorage: boolean;
    /**
     * Whether to enable OpenAPI generation.
     * @default true
     */
    enableOpenApiGen: boolean;
    /**
     * Whether to reuse the port.
     * @default false
     */
    reusePort: boolean;
    /**
     * Whether to enforce that only controller classes (constructors) are accepted by the router.
     * @default false
     */
    controllersOnly: boolean;
    /**
     * Whether to enable OpenTelemetry tracing.
     * @default false
     */
    enableTracing?: boolean;

    /**
     * Whether to enable automatic backpressure based on system CPU load.
     * @default false
     */
    autoBackpressureFeedback?: boolean;
    /**
     * The CPU usage percentage threshold (0-100) at which to start rejecting requests.
     * @default 60
     */
    autoBackpressureLevel?: number;

    /**
     * Whether to enable middleware and handler tracking.
     * When enabled, `ctx.handlerStack` will be populated with the handlers the request has passed through.
     * Also, `ctx.state` will be a Proxy that tracks changes made by each handler.
     * @default false
     */
    enableMiddlewareTracking: boolean;
    /**
     * Maximum number of middleware executions to store in the datastore.
     * Only applies when enableMiddlewareTracking is true.
     * @default 10000
     */
    middlewareTrackingMaxCapacity?: number;
    /**
     * Time-to-live for middleware tracking entries in milliseconds.
     * Entries older than this will be cleaned up.
     * Only applies when enableMiddlewareTracking is true.
     * @default 86400000 (1 day)
     */
    middlewareTrackingTTL?: number;
    /**
     * HTTP logger function.
     */
    httpLogger: (ctx: ShokupanContext<T>) => void;
    /**
     * Logger object.
     */
    logger: {
        verbose: boolean;
        info: (msg: string, props: Record<string, any>) => void;
        debug: (msg: string, props: Record<string, any>) => void;
        warning: (msg: string, props: Record<string, any>) => void;
        error: (msg: string, props: Record<string, any>) => void;
        /**
         * Something fatally went wrong and the application cannot continue.
         */
        fatal: (msg: string, props: Record<string, any>) => void;
    };
    /**
     * Timeout for reading the request body (milliseconds).
     * Maps to Bun's `idleTimeout`.
     * @default 30000
     */
    readTimeout: number;
    /**
     * Timeout for processing the request (milliseconds).
     * Maps to `server.timeout(req, seconds)`.
     * @default 0 (disabled)
     */
    requestTimeout: number;
    /**
     * Timeout for writing the response (milliseconds).
     * Not currently supported by Bun.serve natively.
     */
    writeTimeout: number;

    /**
     * JSX Rendering function.
     */
    renderer: JSXRenderer;

    /**
     * Factory function to create the server instance.
     * Defaults to Bun.serve.
     */
    serverFactory: ServerFactory;

    /**
     * Lifecycle hooks.
     */
    hooks: ShokupanHooks<T> | ShokupanHooks<T>[];


    // Open for extension
    [key: string]: any;
}>;


export interface RequestOptions {
    path?: string;
    url?: string;
    method?: Method;
    headers?: Record<string, string>;
    body?: any;
    query?: Record<string, string>;
}

export interface ProcessResult {
    status: number;
    headers: Record<string, string>;
    data: any;
}

export type ShokupanController<T = any> = (new (...args: any[]) => T) & {
    [$isRouter]?: undefined;
};

export interface StaticServeHooks<T extends Record<string, any>> {
    onRequest?: (ctx: ShokupanContext<T>) => Promise<Response | void> | Response | void;
    onResponse?: (ctx: ShokupanContext<T>, response: Response) => Promise<Response> | Response;
}

export interface StaticServeOptions<T extends Record<string, any>> {
    /**
     * Root directory to serve files from.
     * Can be an absolute path or relative to the CWD.
     */
    root?: string;
    /**
     * Whether to list directory contents if no index file is found.
     * @default false
     */
    listDirectory?: boolean;
    /**
     * Index file(s) to look for when a directory is requested.
     * @default ['index.html', 'index.htm']
     */
    index?: string | string[];
    /**
     * Hooks to intercept requests/responses.
     */
    hooks?: StaticServeHooks<T>;
    /**
     * How to treat dotfiles (files starting with .)
     * 'allow': Serve them
     * 'deny': Return 403
     * 'ignore': Return 404
     * @default 'ignore'
     */
    dotfiles?: 'allow' | 'deny' | 'ignore';
    /**
     * Regex or glob patterns to exclude
     */
    exclude?: (string | RegExp)[];
    /**
     * Try to append these extensions to the path if the file is not found.
     * e.g. ['html', 'htm']
     */
    extensions?: string[];
    /**
     * OpenAPI specification for the static route.
     */
    openapi?: MethodAPISpec;
}
