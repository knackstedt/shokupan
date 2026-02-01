import type { OpenAPI } from '@scalar/openapi-types';
import type { Server } from 'bun';
import type { Server as NodeServer } from 'node:http';
import type { ShokupanContext } from '../context';
import type { ServerAdapter } from './adapter';
import type { FileSystemAdapter } from './adapter/filesystem';
import type { Logger } from './logger';
import { $isRouter } from "./symbol";

export type HeadersInit = Headers | Record<string, string> | [string, string][];

export interface ShokupanPluginOptions {
    path?: string;
}


export interface ShokupanPlugin {
    onInit: (app: any, options?: ShokupanPluginOptions) => void | Promise<void>;
}

export type DeepPartial<T> = T extends Function ? T : T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;

/**
 * Helper type for applications that don't use ctx.state.
 * Prevents accidental property access on state.
 * 
 * @example
 * ```typescript
 * const app = new Shokupan<EmptyState>();
 * ```
 */
export type EmptyState = Record<string, never>;

/**
 * Default state type that allows any properties.
 * This is the default if no state type is specified.
 * 
 * @example
 * ```typescript
 * const app = new Shokupan<DefaultState>();
 * // Equivalent to: new Shokupan();
 * ```
 */
export type DefaultState = Record<string, any>;

// Utility type to extract parameter names from a route path
// Example: "/users/:id/posts/:postId" => { id: string, postId: string }
type ParsePathParams<Path extends string> =
    Path extends `${infer _Start}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ParsePathParams<`/${Rest}`>]: string }
    : Path extends `${infer _Start}:${infer Param}`
    ? { [K in Param]: string }
    : {};

// Helper type for route parameters
// Falls back to Record<string, string> if no params are detected
export type RouteParams<Path extends string> =
    string extends Path
    ? Record<string, string>
    : ParsePathParams<Path> extends Record<string, never>
    ? Record<string, string>
    : ParsePathParams<Path>;

/**
 * Type guard to check if a state property exists and narrow its type.
 * 
 * @example
 * ```typescript
 * if (hasStateProperty(ctx, 'userId')) {
 *     // ctx.state.userId is now typed as defined (not undefined)
 *     console.log(ctx.state.userId);
 * }
 * ```
 */
export function hasStateProperty<
    S extends Record<string, any>,
    K extends string
>(
    state: S,
    key: K
): key is K & keyof S {
    return key in state && state[key] !== undefined;
}

/**
 * Runtime assertion that a state property exists.
 * Throws an error if the property is missing.
 * 
 * @example
 * ```typescript
 * requireStateProperty(ctx.state, 'userId');
 * // Now TypeScript knows ctx.state.userId exists
 * const id = ctx.state.userId;
 * ```
 */
export function requireStateProperty<
    S extends Record<string, any>,
    K extends keyof S
>(
    state: S,
    key: K,
    message?: string
): asserts state is S & Record<K, NonNullable<S[K]>> {
    if (!(key in state) || state[key] == null) {
        throw new Error(
            message ?? `Required state property "${String(key)}" is not set`
        );
    }
}

/**
 * Type-safe state getter with optional default value.
 * 
 * @example
 * ```typescript
 * const userId = getStateProperty(ctx.state, 'userId', 'anonymous');
 * ```
 */
export function getStateProperty<
    S extends Record<string, any>,
    K extends keyof S,
    D = undefined
>(
    state: S,
    key: K,
    defaultValue?: D
): S[K] | D {
    if (key in state && state[key] !== undefined) {
        return state[key];
    }
    return defaultValue as D;
}

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
    /**
     * Whether to generate a strictly compliant OpenAPI spec (stripping x- extensions).
     * @default false
     */
    compliant?: boolean;
    /**
     * Array to collect warnings during generation.
     */
    warnings?: any[];
}

export interface AsyncAPIOptions {
    info?: {
        title: string;
        version: string;
        description?: string;
    };
    defaultTag?: string;
    /**
     * Array to collect warnings during generation.
     */
    warnings?: any[];
}

export interface AsyncAPISpec {
    type?: 'publish' | 'subscribe';
    summary?: string;
    description?: string;
    tags?: string[];
    message?: {
        name?: string;
        title?: string;
        summary?: string;
        payload?: any;
        headers?: any;
    };
}

export interface ShokupanHooks<T = any> {
    onError?: (ctx: ShokupanContext<T>, error: unknown) => void | Promise<void>;
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

/**
 * Helper interface for generic streaming operations.
 * Provides methods to write data, pipe streams, and handle abort events.
 */
export interface StreamHelper {
    /**
     * Write data to the stream.
     * @param data Data to write (Uint8Array or string, strings are auto-encoded to UTF-8)
     */
    write(data: Uint8Array | string): Promise<void>;
    /**
     * Pipe a ReadableStream to this stream.
     * @param stream ReadableStream to pipe
     */
    pipe(stream: ReadableStream): Promise<void>;
    /**
     * Sleep for a specified duration.
     * @param ms Milliseconds to sleep
     */
    sleep(ms: number): Promise<void>;
    /**
     * Register a callback to be executed when the stream is aborted.
     * @param callback Callback function
     */
    onAbort(callback: () => void): void;
}

/**
 * Helper interface for text streaming operations.
 * Provides methods to write text with or without newlines.
 */
export interface TextStreamHelper {
    /**
     * Write text to the stream without a newline.
     * @param text Text to write
     */
    write(text: string): Promise<void>;
    /**
     * Write text to the stream with a newline.
     * @param text Text to write
     */
    writeln(text: string): Promise<void>;
    /**
     * Sleep for a specified duration.
     * @param ms Milliseconds to sleep
     */
    sleep(ms: number): Promise<void>;
    /**
     * Register a callback to be executed when the stream is aborted.
     * @param callback Callback function
     */
    onAbort(callback: () => void): void;
}

/**
 * Helper interface for Server-Sent Events (SSE) streaming.
 * Provides methods to write SSE-formatted messages.
 */
export interface SSEStreamHelper {
    /**
     * Write a Server-Sent Event message.
     * @param message SSE message with data, event, id, and retry fields
     */
    writeSSE(message: SSEMessage): Promise<void>;
    /**
     * Sleep for a specified duration.
     * @param ms Milliseconds to sleep
     */
    sleep(ms: number): Promise<void>;
    /**
     * Register a callback to be executed when the stream is aborted.
     * @param callback Callback function
     */
    onAbort(callback: () => void): void;
}

/**
 * Server-Sent Event message format.
 */
export interface SSEMessage {
    /**
     * The data payload of the event.
     */
    data: string;
    /**
     * Optional event type.
     */
    event?: string;
    /**
     * Optional event ID.
     */
    id?: string;
    /**
     * Optional reconnection time in milliseconds.
     */
    retry?: number;
}

/**
 * Error handler for stream operations.
 */
export type StreamErrorHandler = (err: Error, stream: StreamHelper) => void | Promise<void>;

/**
 * Error handler for text stream operations.
 */
export type TextStreamErrorHandler = (err: Error, stream: TextStreamHelper) => void | Promise<void>;

/**
 * Error handler for SSE stream operations.
 */
export type SSEStreamErrorHandler = (err: Error, stream: SSEStreamHelper) => void | Promise<void>;



export type ShokupanHandler<
    State extends Record<string, any> = Record<string, any>,
    Params extends Record<string, string> = Record<string, string>
> = ((ctx: ShokupanContext<State, Params>, next?: NextFn) => Promise<any> | any) & { originalHandler?: ShokupanHandler<State, Params>; };
export const HTTPMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "ALL"];
export type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD" | "ALL";

export enum RouteParamType {
    BODY = "BODY",
    PARAM = "PARAM",
    QUERY = "QUERY",
    HEADER = "HEADER",
    REQUEST = "REQUEST",
    CONTEXT = "CONTEXT",
    SERVICE = "SERVICE"
}

export interface ServerFactory {
    (options: any): Server<any> | Promise<Server<any>> | NodeServer | Promise<NodeServer>;
}

export interface ErrorHandler<T = any> {
    (err: T, ctx: ShokupanContext): Response | Promise<Response>;
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
     * @default false
     */
    controllersOnly: boolean;

    /**
     * Whether to enable automatic backpressure based on system CPU load.
     * @default false
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
     * Optimization: Handler with hooks baked in.
     * Used by runtime router, while `handler` is used by OpenAPI generator.
     */
    bakedHandler?: ShokupanHandler;
    /**
     * OpenAPI spec for the route
     */
    handlerSpec?: MethodAPISpec | AsyncAPISpec;
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
    /**
     * Controller instance this route belongs to
     */
    controller?: any;
    /**
     * Middleware stack metadata for this route (Controller/Method level)
     */
    middleware?: Middleware[];
    /**
     * Whether this route is a WebSocket route
     */
    isSocket?: boolean;
};

export type ShokupanConfig<T extends Record<string, any> = Record<string, any>> = Partial<{
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
     * Whether to enable monkeypatching of the global Promise constructor.
     * When enabled, Promises created within an async context will carry that context
     * (including `requestId`) and the creation stack trace. This increases memory and
     * cpu usage, but provides richer logging for unhandled rejections.
     * @default false
     */
    enablePromiseMonkeypatch: boolean;
    /**
     * Whether to block server startup until OpenAPI generation completes.
     * Only applies when enableOpenApiGen is true.
     * When false, OpenAPI generation happens asynchronously in the background.
     * @default true
     */
    blockOnOpenApiGen: boolean;
    /**
     * Whether to enable AsyncAPI generation.
     * @default false
     */
    enableAsyncApiGen: boolean;
    /**
     * Whether to block server startup until AsyncAPI generation completes.
     * Only applies when enableAsyncApiGen is true.
     * When false, AsyncAPI generation happens asynchronously in the background.
     * @default true
     */
    blockOnAsyncApiGen: boolean;
    /**
     * Whether to use async AST scanning with worker threads.
     * When enabled, AST analysis runs in a separate thread to avoid blocking server startup.
     * @default true
     */
    enableAsyncAstScanning?: boolean;
    /**
     * Maximum time (ms) to wait for AST analysis before timing out.
     * Only applies when enableAsyncAstScanning is true.
     * @default 30000 (30 seconds)
     */
    astAnalysisTimeout?: number;
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
     * Query parser mode.
     * - `extended`: Arrays for duplicate keys (default).
     * - `simple`: First value only for duplicate keys.
     * - `strict`: Throws 400 error on duplicate keys.
     * @default 'extended'
     */
    queryParserMode?: 'extended' | 'simple' | 'strict';

    /**
     * JSON parser to use for parsing request bodies.
     * 
     * Options:
     * - `'native'`: Use the built-in JSON.parse (fastest, default)
     * - `'parse-json'`: Use the parse-json library for better error messages with minimal performance overhead (~5% slower than native)
     * - `'secure-json-parse'`: Use secure-json-parse for protection against prototype pollution (20-30% slower than native)
     * 
     * Performance implications based on benchmarks:
     * - `native`: Fastest option, excellent for production
     * - `parse-json`: Nearly identical performance to native with better error messages, good for development
     * - `secure-json-parse`: Provides security at the cost of performance, use only for untrusted input
     * 
     * @default 'native'
     */
    jsonParser?: 'native' | 'parse-json' | 'secure-json-parse';

    /**
     * Whether to enable automatic backpressure based on system CPU load.
     * @default false
     */
    autoBackpressureFeedback?: boolean;
    /**
     * The CPU usage percentage threshold (0-100) at which to start rejecting requests (429).
     * @default 60
     */
    autoBackpressureLevel?: number;

    /**
     * Whether to enable automatic content negotiation for ctx.json() and other response methods.
     * When enabled, ctx.json() will use the response transformer registry to negotiate the best
     * response format based on the Accept header.
     * @default false
     */
    enableAutoContentNegotiation?: boolean;

    /**
     * Default response transformer content type.
     * If set, ctx.respond() and auto-negotiated ctx.json() will use this transformer
     * when no Accept header matches or when Accept is any.
     * @default 'application/json'
     */
    defaultResponseTransformer?: string;

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
     * Whether to enable the HTTP bridge for WebSocket.
     * This enables websocket messages to run through the HTTP server.
     * e.g. 
     * ```json
        * {
        *  "method": "POST",
        *  "path": "/api/v1/myHttpEndpoint",
        *  "headers": {},
        *  "body": {
     *      "type": "text",
        *      "data": "Hello, world!"
     *  }
        * }
     * ```
     * @default false
     */
    enableHTTPBridge?: boolean;
    /**
     * Handler for WebSocket events that throw an exception.
     */
    websocketErrorHandler?: (err: any, ctx: ShokupanContext<T>) => void | Promise<void>;
    /**
     * Unique ID generator function for requests.
     * @default nanoid
     */
    idGenerator?: () => string;
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
    logger: Logger;
    /**
     * Timeout for reading the request body (milliseconds).
     * Maps to Bun's `idleTimeout`.
     * @default 30000
     */
    readTimeout: number;

    /**
     * Maximum allowed request body size in bytes.
     * Requests larger than this will be rejected with 413 Payload Too Large.
     * @default 10485760 (10MB)
     */
    maxBodySize?: number;

    /**
     * Timeout for processing the request (milliseconds).
     * Maps to `server.timeout(req, seconds)`.
     * @default 0 (disabled)
     */
    requestTimeout: number;
    /**
     * Timeout for writing the response (milliseconds).
     * Not currently supported by Bun.serve natively.
     * @experimental
     */
    writeTimeout: number;

    /**
     * JSX Rendering function.
     */
    renderer: JSXRenderer;

    /**
     * Factory function to create the server instance.
     * Defaults to Bun.serve.
     * @deprecated Use `adapter` instead.
     */
    serverFactory: ServerFactory;

    /**
     * The server adapter to use.
     * overrides `serverFactory`.
     */
    adapter?: 'bun' | 'node' | 'wintercg' | 'h3' | ServerAdapter;

    /**
     * The file system adapter to use for `ctx.file`.
     */
    fileSystem?: FileSystemAdapter;

    /**
     * Lifecycle hooks.
     */
    hooks: ShokupanHooks<T> | ShokupanHooks<T>[];

    /**
     * Whether to validate response status codes.
     * @default true
     */
    validateStatusCodes: boolean;

    /**
     * @deprecated Use `datastore` config instead.
     */
    surreal?: any;

    datastore?: {
        adapter: 'surreal' | 'sqlite' | 'level' | 'knex';
        /**
         * Options for the specific adapter.
         * - For 'surreal', this matches SurrealAdapterOptions
         * - For 'sqlite', this matches SqliteAdapterOptions
         * - For 'level', this matches LevelAdapterOptions
         * - For 'knex', this matches KnexAdapterOptions (Knex.Config)
         */
        options?: any;
    };



    /**
     * Configuration for the AI Plugin manifest (.well-known/ai-plugin.json).
     * If enabled, Shokupan will serve the manifest at the standard location.
     */
    aiPlugin?: {
        enabled?: boolean;
        name_for_human?: string;
        name_for_model?: string;
        description_for_human?: string;
        description_for_model?: string;
        auth?: {
            type: 'none' | 'service_http' | 'user_http' | 'oauth';
            [key: string]: any;
        };
        api?: {
            type: 'openapi';
            url?: string;
            is_user_authenticated?: boolean;
        };
        logo_url?: string;
        contact_email?: string;
        legal_info_url?: string;
    };

    /**
     * Configuration for the API Catalog (.well-known/api-catalog).
     * If enabled, Shokupan will serve the catalog at the standard location.
     */
    apiCatalog?: {
        enabled?: boolean;
        versions?: Array<{
            name: string;
            url: string;
            spec_url: string;
        }>;
    };

    /**
     * Configuration for Security Headers.
     * Can be a boolean to enable/disable defaults, or an object options.
     * @default false
     */
    defaultSecurityHeaders?: boolean | any;

    /**
     * Any other config options are allowed, but will be ignored. 
     * @deprecated
     */
    [key: string]: any;

    /**
     * IDE configuration for file links.
     * Can be a specific editor name (vscode, intellij, etc.) or an autodetection mode.
     * Overrides process.env.IDE.
     * 
     * Options:
     * - 'vscode', 'vscode-insiders', 'vscodium', 'cursor', 'intellij', 'sublime', 'neovim'
     * - 'vscode.dev': Force generic vscode.dev links
     * - 'autodetect-vscode.dev': Auto-detect git remote and generate specific vscode.dev links
     * - 'autodetect-repo': Auto-detect git remote and generate web repository links
     */
    ide?: string;

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
     * 
     * Security Note: Directory listing is disabled by default to prevent information disclosure.
     * Enable this only if you specifically need it and understand the security implications.
     * 
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
    /**
     * Enable ETags for static files.
     */
    etag?: boolean;
    /**
     * Maximum age for the cache.
     */
    maxAge?: number;
    /**
     * Whether the file is immutable.
     * maxAge must be set to a value > 0 for this to have any effect.
     */
    immutable?: boolean;
    /**
     * Whether to use the cache.
     * @default true
     */
    useCache?: boolean;
};
