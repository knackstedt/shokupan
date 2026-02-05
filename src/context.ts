import type { BodyInit, Server, ServerWebSocket } from 'bun';
import { nanoid } from 'nanoid';
import { readFile } from 'node:fs/promises';
import { inspect } from 'node:util';
import type { Socket, Server as SocketServer } from 'socket.io';
import type { Shokupan } from './shokupan';
import { BodyParser } from './util/body-parser';
import { parseCookies } from './util/cookie-parser';
import { VALID_HTTP_STATUSES, VALID_REDIRECT_STATUSES } from './util/http-status';
import { parseQuery } from './util/query-string';
import type { ShokupanRequest } from './util/request';
import { ShokupanResponse } from './util/response';
import { $bodyParsed, $bodyParseError, $bodyType, $cachedBody, $cachedCookies, $cachedHost, $cachedHostname, $cachedOrigin, $cachedProtocol, $cachedQuery, $debug, $finalResponse, $io, $onWsMessage, $rawBody, $requestId, $routeMatched, $socket, $url, $ws, $wsMessages } from './util/symbol';
import type { CookieOptions, HeadersInit, JSXRenderer, SSEMessage, SSEStreamErrorHandler, SSEStreamHelper, StreamErrorHandler, StreamHelper, TextStreamErrorHandler, TextStreamHelper } from './util/types';

/**
 * Inline WebSocket handlers for ctx.upgrade()
 */
export interface InlineWebSocketHandlers<T = any> {
    open?: (ctx: ShokupanContext<T>, ws: ServerWebSocket<any>) => void | Promise<void>;
    message?: (ctx: ShokupanContext<T>, ws: ServerWebSocket<any>, message: string | Buffer) => void | Promise<void>;
    close?: (ctx: ShokupanContext<T>, ws: ServerWebSocket<any>, code?: number, reason?: string) => void | Promise<void>;
    error?: (ctx: ShokupanContext<T>, ws: ServerWebSocket<any>, error: Error) => void | Promise<void>;
}

/**
 * Security: Validate if a cookie domain is safe to use
*/
function isValidCookieDomain(domain: string, currentHost: string): boolean {
    // Remove port from current host if present
    const hostWithoutPort = currentHost.split(':')[0];

    // Domain must be current host or a parent domain
    if (domain === hostWithoutPort) return true;

    // Check if domain is a parent domain (starts with .)
    if (domain.startsWith('.')) {
        const domainWithoutDot = domain.slice(1);
        // Current host must end with the domain
        return hostWithoutPort.endsWith(domainWithoutDot);
    }

    return false;
}



export interface HandlerStackItem {
    name: string;
    file: string;
    line: number;
    isBuiltin?: boolean;
    stateChanges?: Record<string, any>;
    startTime?: number;
    duration?: number;
}

export interface DebugCollector {
    trackStep(id: string | undefined, type: string, duration: number, status: 'success' | 'error', error?: any): void;
    trackEdge(fromId: string | undefined, toId: string | undefined): void;
    setNode(id: string): void;
    getCurrentNode(): string | undefined;
}

/**
 * Shokupan Request Context
 * 
 * The context object passed to all middleware and route handlers.
 * Provides access to request data, response helpers, and typed state management.
 * 
 * @template State - The shape of `ctx.state` for type-safe state access across middleware.
 * @template Params - The shape of `ctx.params` based on the route path pattern.
 * 
 * @example Basic Usage
 * ```typescript
 * app.get('/hello', (ctx) => {
 *   return ctx.json({ message: 'Hello' });
 * });
 * ```
 * 
 * @example Typed State
 * ```typescript
 * interface AppState {
 *   userId: string;
 *   requestId: string;
 * }
 * 
 * const app = new Shokupan<AppState>();
 * 
 * app.use((ctx, next) => {
 *   ctx.state.requestId = crypto.randomUUID(); // ✓ Type-safe
 *   return next();
 * });
 * ```
 * 
 * @example Typed Path Parameters
 * ```typescript
 * app.get('/users/:userId/posts/:postId', (ctx) => {
 *   // ctx.params is automatically typed as { userId: string; postId: string }
 *   const { userId, postId } = ctx.params;
 *   return ctx.json({ userId, postId });
 * });
 * ```
 * 
 * @example Full Type Safety (State + Params)
 * ```typescript
 * interface RequestState {
 *   userId: string;
 *   permissions: string[];
 * }
 * 
 * const app = new Shokupan<RequestState>();
 * 
 * app.get('/admin/users/:userId', (ctx) => {
 *   // Both typed!
 *   const { userId } = ctx.params;        // ✓ From path
 *   const { permissions } = ctx.state;     // ✓ From state
 *   
 *   if (!permissions.includes('admin')) {
 *     return ctx.json({ error: 'Forbidden' }, 403);
 *   }
 *   return ctx.json({ userId });
 * });
 * ```
 */
export class ShokupanContext<
    State extends Record<string, any> = Record<string, any>,
    Params extends Record<string, string> = Record<string, string>
> {
    public params: Params = {} as Params; // Router assigns this, but default to empty object
    public state: State;
    public handlerStack: HandlerStackItem[] = [];

    public readonly response: ShokupanResponse;
    public [$debug]?: DebugCollector;
    public [$finalResponse]?: Response;
    public [$rawBody]?: string | ArrayBuffer | Uint8Array; // Raw body for compression optimization

    /**
     * Application logger instance
     */
    get logger() {
        return this.app?.logger;
    }

    // Body caching to avoid double parsing
    private [$url]?: URL;
    private [$cachedBody]?: any;
    private [$bodyType]?: 'json' | 'text' | 'formData' | 'arrayBuffer' | 'blob';
    private [$bodyParsed]: boolean = false;
    private [$bodyParseError]?: Error;

    public [$routeMatched]: boolean = false;


    // Cached URL properties to avoid repeated parsing
    private [$cachedHostname]?: string;
    private [$cachedProtocol]?: string;
    private [$cachedHost]?: string;
    private [$cachedOrigin]?: string;
    private [$cachedQuery]?: Record<string, any>;
    private [$cachedCookies]?: Record<string, string>;

    private disconnectCallbacks: (() => void | Promise<void>)[] = [];

    /**
     * Registers a callback to be executed when the associated WebSocket disconnects.
     * This is only applicable for requests that are part of a WebSocket interaction or upgrade.
     */
    public onSocketDisconnect(callback: () => void | Promise<void>) {
        this.disconnectCallbacks.push(callback);
    }

    /**
     * @internal
     * Retrieves registered disconnect callbacks for execution.
     */
    public getDisconnectCallbacks() {
        return this.disconnectCallbacks;
    }
    private [$ws]?: ServerWebSocket;
    private [$socket]?: Socket;
    private [$io]?: SocketServer;

    /**
     * JSX Rendering Function
     */
    private renderer?: JSXRenderer;
    setRenderer(renderer: JSXRenderer) {
        this.renderer = renderer;
    }

    private [$requestId]: string;
    get requestId() {
        return this[$requestId] ??= (this.app?.applicationConfig?.idGenerator?.() ?? nanoid());
    }

    [
        // Only apply a custom inspect symbol in Node.js, Deno, or Bun.
        globalThis.navigator?.userAgent?.match(/Node\.js|Deno|Bun/)
            ? Symbol.for("nodejs.util.inspect.custom")
            : Symbol.for("no-op")
    ]() {
        const innerString = inspect({
            method: this.request.method,
            url: this.request.url,
            requestHeaders: new Map(this.request.headers),
            sessionId: this.sessionID,
            state: this.state,
            params: this.params,
            response: this[$finalResponse]?.body,
            responseHeaders: new Map(this[$finalResponse]?.headers as any),
            handlerStack: this.handlerStack.map(h => h.name === "anonymous" ? (h.file + ":" + h.line) : h.name)
        }, { depth: null, colors: true, numericSeparator: true, customInspect: true });

        return "Context(" + this.requestId + ") {" + innerString.slice(1, -2) + ",\n  ...others\n}";
    }

    constructor(
        public readonly request: ShokupanRequest<any>,
        public readonly server?: Server<any>,
        state?: State,
        public readonly app?: Shokupan,
        public readonly signal?: AbortSignal, // Optional as it might not be provided in tests or simple creates
        enableMiddlewareTracking: boolean = false,
        requestId?: string
    ) {
        this.state = state || {} as State;
        this[$requestId] = requestId;

        if (enableMiddlewareTracking) {
            const self = this;
            this.state = new Proxy(this.state, {
                set(target, p, newValue, receiver) {
                    const result = Reflect.set(target, p, newValue, receiver);
                    const currentHandler = self.handlerStack[self.handlerStack.length - 1];
                    if (currentHandler) {
                        if (!currentHandler.stateChanges) currentHandler.stateChanges = {};
                        currentHandler.stateChanges[p as string] = newValue;
                    }
                    return result;
                }
            });
        }
        this.response = new ShokupanResponse();
    }

    get url(): URL {
        if (!this[$url]) {
            // WebSocket contexts may have empty request URLs
            const urlString = this.request.url || 'http://localhost/';
            this[$url] = new URL(urlString);
        }
        return this[$url];
    }

    /**
     * Base request
     */
    get req() { return this.request; }
    /**
     * HTTP method
     */
    get method() { return this.request.method; }
    /**
     * Request path
     */
    get path() {
        // Optimization: return cached path if url already parsed
        if (this[$url]) return this[$url].pathname;

        // Fast path extraction without URL parsing
        const url = this.request.url;

        // Handle full URL: http://localhost:3000/foo?bar
        let queryIndex = url.indexOf('?');
        const end = queryIndex === -1 ? url.length : queryIndex;

        // Ensure we skip protocol/host
        let start = 0;
        const protocolIndex = url.indexOf('://');
        if (protocolIndex !== -1) {
            const hostStart = protocolIndex + 3;
            // Find first slash after host
            const pathStart = url.indexOf('/', hostStart);
            if (pathStart !== -1 && pathStart < end) {
                start = pathStart;
            } else {
                return '/';
            }
        } else {
            // Relative or simple path
            if (url.charCodeAt(0) === 47) { // '/'
                start = 0;
            }
        }

        return url.substring(start, end);
    }
    /**
     * Request query params
     */
    get query() {
        if (this[$cachedQuery]) return this[$cachedQuery];

        const mode = this.app?.applicationConfig?.queryParserMode || 'extended';
        // Use optimized parser
        this[$cachedQuery] = parseQuery(this.request.url, mode);

        return this[$cachedQuery];
    }

    /**
     * Request cookies
     */
    get cookies() {
        if (this[$cachedCookies]) return this[$cachedCookies];

        const cookieHeader = this.request.headers.get("cookie");
        // Use optimized parser
        this[$cachedCookies] = parseCookies(cookieHeader || '');

        return this[$cachedCookies]!;
    }

    /**
     * Client IP address
     */
    get ip() { return this.server?.requestIP(this.request as unknown as Request); }

    /**
     * Request hostname (e.g. "localhost")
     */
    get hostname() {
        return this[$cachedHostname] ??= this.url.hostname;
    }

    /**
     * Request host (e.g. "localhost:3000")
     */
    get host() {
        return this[$cachedHost] ??= this.url.host;
    }

    /**
     * Request protocol (e.g. "http:", "https:")
     */
    get protocol() {
        return this[$cachedProtocol] ??= this.url.protocol;
    }

    /**
     * Whether request is secure (https)
     */
    get secure() { return this.protocol === 'https:'; }

    /**
     * Request origin (e.g. "http://localhost:3000")
     */
    get origin() {
        return this[$cachedOrigin] ??= this.url.origin;
    }

    /**
     * Request headers
     */
    get headers() { return this.request.headers; }

    /**
     * Get a request header
     * @param name Header name
     */
    public get(name: string) { return this.request.headers.get(name); }

    /**
     * Base response object
     */
    get res() { return this.response; }

    /**
     * Get the raw response body content (if available)
     */
    get responseBody() { return this[$rawBody]; }

    /**
     * Raw WebSocket connection
     */
    get ws() { return this[$ws]; }

    /**
     * Socket.io socket
     */
    get socket() { return this[$socket]; }

    /**
     * Socket.io server
     */
    get io() { return this[$io]; }

    /**
     * Helper to set a header on the response
     * @param key Header key
     * @param value Header value
     */
    public set(key: string, value: string) {
        this.response.set(key, value);
        return this;
    }

    public isUpgraded: boolean = false;

    /**
     * Upgrades the request to a WebSocket connection.
     * 
     * @param options Upgrade options or inline WebSocket handlers
     * @returns true if upgraded, false otherwise
     * 
     * This method will link the WebSocket connection to the context object, 
     * allowing you to access the connection in your handlers.
     * 
     * @example Inline handlers
     * ```ts
     * app.get('/ws', (ctx) => {
     *   ctx.upgrade({
     *     open: (ctx, ws) => ws.send("Connected"),
     *     message: (ctx, ws, msg) => ws.send(msg),
     *     close: (ctx, ws) => console.log("Disconnected")
     *   });
     * });
     * ```
     */
    public upgrade(options?: Parameters<Server<State>["upgrade"]>[1] | InlineWebSocketHandlers<State> & { data?: any; }) {
        if (!this.server) return false;

        // WebSocket upgrades must be GET requests
        if (this.request.method !== 'GET') {
            throw new Error('WebSocket upgrade requires GET method');
        }

        let wsOptions;

        // Initialize tracking array

        // Check if inline handlers are provided
        if (options !== undefined) {

            if (typeof options === 'function') {
                // Function options not supported by Bun upgrade
                return false;
            }
            else if (options && typeof (options as any).open === 'function') {
                // It's InlineWebSocketHandlers
                const handlers = options as InlineWebSocketHandlers<State>;

                // Check configuration
                // Always wrap handlers to ensure `ctx` injection, regardless of tracking config
                // This fixes the signature mismatch between router (ctx, ws) and adapter/bun (ws)

                // Initialize tracking array if enabled
                if (this.app.applicationConfig.enableWebSocketTracking) {
                    (this as any)[$wsMessages] = [];
                }

                // Construct wrapped handlers
                const WrappedHandler = {
                    open: (ws: ServerWebSocket<any>) => {
                        // Tracking Logic (if enabled)
                        if (this.app.applicationConfig.enableWebSocketTracking) {
                            const track = (type: 'open' | 'close' | 'message', dir: 'in' | 'out', size?: number) => {
                                const msg = {
                                    type,
                                    dir,
                                    size: size || 0,
                                    timestamp: Date.now()
                                };
                                (this as any)[$wsMessages].push(msg);
                                // console.log('[Context Debug] Tracking WS Message:', type, dir, 'Handler:', !!(this as any)[$onWsMessage], 'ID:', this.requestId);
                                if ((this as any)[$onWsMessage]) {
                                    (this as any)[$onWsMessage](msg);
                                }
                            };

                            track('open', 'in');

                            // Proxy send methods to capture outgoing messages
                            const originalSend = ws.send.bind(ws);
                            ws.send = (data, compress) => {
                                const size = typeof data === 'string' ? data.length : (data as any)?.byteLength || 0;
                                track('message', 'out', size);
                                return originalSend(data, compress);
                            };

                            const originalPublish = ws.publish.bind(ws);
                            ws.publish = (topic, data, compress) => {
                                const size = typeof data === 'string' ? data.length : (data as any)?.byteLength || 0;
                                track('message', 'out', size);
                                return originalPublish(topic, data, compress);
                            };
                        }

                        if (this.app.applicationConfig.enableWebSocketTracking) {
                            const msg = {
                                type: 'open',
                                dir: 'in',
                                size: 0,
                                timestamp: Date.now()
                            };
                            (this as any)[$wsMessages].push(msg);
                            if ((this as any)[$onWsMessage]) (this as any)[$onWsMessage](msg);
                        }

                        if (handlers.open) handlers.open(this, ws);
                    },
                    message: (ws: ServerWebSocket<any>, message: string | Buffer) => {
                        if (this.app.applicationConfig.enableWebSocketTracking) {
                            const size = typeof message === 'string' ? message.length : (message as any)?.byteLength || 0;
                            const msg = {
                                type: 'message',
                                dir: 'in',
                                size,
                                timestamp: Date.now()
                            };
                            (this as any)[$wsMessages].push(msg);
                            if ((this as any)[$onWsMessage]) (this as any)[$onWsMessage](msg);
                        }

                        if (handlers.message) handlers.message(this, ws, message);
                    },
                    close: (ws: ServerWebSocket<any>, code: number, message: string) => {
                        if (this.app.applicationConfig.enableWebSocketTracking) {
                            const msg = {
                                type: 'close',
                                dir: 'in',
                                size: 0,
                                timestamp: Date.now()
                            };
                            (this as any)[$wsMessages].push(msg);
                            if ((this as any)[$onWsMessage]) (this as any)[$onWsMessage](msg);
                        }

                        if (handlers.close) handlers.close(this, ws, code, message);
                    },
                    drain: (ws: ServerWebSocket<any>) => {
                        // Handler interface does not support drain yet, but adapter calls it
                    },
                    error: (ws: ServerWebSocket<any>, error: Error) => {
                        if (this.app.applicationConfig.enableWebSocketTracking) {
                            const msg = {
                                type: 'error',
                                dir: 'in',
                                size: 0,
                                timestamp: Date.now()
                            };
                            (this as any)[$wsMessages].push(msg);
                            if ((this as any)[$onWsMessage]) (this as any)[$onWsMessage](msg);
                        }

                        if (handlers.error) handlers.error(this, ws, error);
                    }
                };

                // Inject wrappedHandlers into data.handler for BunAdapter
                wsOptions = {
                    data: {
                        ...((options as any).data || {}),
                        ctx: this,
                        createdAt: Date.now(),
                        ...this.state,
                        handler: WrappedHandler
                    }
                };
            }

        }

        // Standard upgrade with data/headers
        const success = this.server.upgrade(this.req as any, wsOptions ?? options);
        if (success) {
            this.isUpgraded = true;
        }
        return success;
    }

    /**
     * Set a cookie
     * @param name Cookie name
     * @param value Cookie value
     * @param options Cookie options
     */
    public setCookie(name: string, value: string, options: CookieOptions = {}) {
        // Security: Validate domain attribute to prevent cookie injection
        if (options.domain) {
            const currentHost = this.hostname;
            if (!isValidCookieDomain(options.domain, currentHost)) {
                throw new Error(`Invalid cookie domain: ${options.domain} for host ${currentHost}`);
            }
        }

        // Robust Cookie Serialization
        let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
        if (options.maxAge) cookie += `; Max-Age=${Math.floor(options.maxAge)}`;
        if (options.domain) cookie += `; Domain=${options.domain}`;
        if (options.path) cookie += `; Path=${options.path || '/'}`;
        if (options.expires) cookie += `; Expires=${options.expires.toUTCString()}`;
        if (options.httpOnly) cookie += `; HttpOnly`;
        if (options.secure) cookie += `; Secure`;

        let sameSite = options.sameSite;
        if (sameSite === true) sameSite = 'Strict';
        if (sameSite === undefined || sameSite === false) {
            // Do not set SameSite if undefined/false? Or Default to Lax?
            // Modern browsers default to Lax.
            // We'll leave it omit unless specified.
        } else {
            const stringSameSite = typeof sameSite === 'string' ? sameSite.toLowerCase() : sameSite;
            switch (stringSameSite) {
                case 'lax': cookie += '; SameSite=Lax'; break;
                case 'strict': cookie += '; SameSite=Strict'; break;
                case 'none': cookie += '; SameSite=None'; break;
                default: cookie += '; SameSite=Lax'; break;
            }
        }

        if (options.priority) {
            const p = options.priority.toLowerCase();
            if (p === 'low') cookie += '; Priority=Low';
            else if (p === 'medium') cookie += '; Priority=Medium';
            else if (p === 'high') cookie += '; Priority=High';
        }

        this.response.append('Set-Cookie', cookie);
        return this;
    }

    private mergeHeaders(headers?: HeadersInit): Headers {
        let h: Headers;
        // Optimization: avoid double allocation if response headers are empty/null
        if (this.response.hasPopulatedHeaders) {
            h = new Headers(this.response.headers);
        } else {
            h = new Headers();
        }

        if (headers) {
            // Efficient merge dependent on type
            if (headers instanceof Headers) {
                headers.forEach((v, k) => h.set(k, v));
            } else if (Array.isArray(headers)) {
                headers.forEach(([k, v]) => h.set(k, v));
            } else {
                // Object iteration
                const keys = Object.keys(headers);
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    const val = (headers as any)[key];
                    h.set(key, val);
                }
            }
        }
        return h;
    }


    /**
     * Read request body with caching to avoid double parsing.
     * The body is only parsed once and cached for subsequent reads.
     */
    /**
     * Read request body with caching to avoid double parsing.
     * The body is only parsed once and cached for subsequent reads.
     */
    async body<T = any>(): Promise<T> {
        // If there was an error during pre-parsing, throw it now
        if (this[$bodyParseError] !== undefined) {
            throw this[$bodyParseError];
        }

        // Return cached body if already parsed
        if (this[$bodyParsed] === true) {
            return this[$cachedBody] as T;
        }

        const config = this.app?.applicationConfig || {};
        const { type, body } = await BodyParser.parse(this.request, config);

        this[$bodyType] = type as any;
        this[$cachedBody] = body;
        this[$bodyParsed] = true;

        return this[$cachedBody] as T;
    }

    /**
     * Pre-parse the request body before handler execution.
     * This improves performance and enables Node.js compatibility for large payloads.
     * Errors are deferred until the body is actually accessed in the handler.
     */
    async parseBody(): Promise<void> {
        // Skip if already parsed
        if (this[$bodyParsed]) {
            return;
        }

        // Skip for methods that typically don't have bodies
        if (this.request.method === 'GET' || this.request.method === 'HEAD') {
            return;
        }

        const maxBodySize = this.app?.applicationConfig?.maxBodySize ?? 10 * 1024 * 1024; // Default 10MB

        // 1. Fast check: Content-Length header
        const contentLength = parseInt(this.request.headers.get("content-length") || "0", 10);
        if (contentLength > maxBodySize) {
            this[$bodyParseError] = new Error("Payload Too Large");
            (this[$bodyParseError] as any).status = 413;
            // We can't easily return 413 here since this is async void, error stored for access
            return;
        }

        try {
            await this.body(); // Trigger body parsing and caching
        } catch (error: any) {
            if (error.status === 413 || error.message === "Payload Too Large") {
                this[$bodyParseError] = error;
            } else {
                // Store error for later throwing when body is accessed
                this[$bodyParseError] = error as Error;
            }
        }
    }



    /**
     * Respond with automatic content negotiation
     * Uses Accept header to determine the best response format
     * @param data Data to respond with
     * @param status HTTP status code
     * @param headers Additional headers
     */
    async respond(data: any, status?: number, headers?: HeadersInit): Promise<Response> {
        const registry = this.app?.responseTransformerRegistry;

        // If no registry or app (should be rare), fallback to JSON
        if (!registry) {
            return this.json(data, status, headers);
        }

        const acceptHeader = this.request.headers.get('accept') || '*/*';
        let transformer = registry.negotiate(acceptHeader);

        // If negotiation failed to find a match, check if there's a default transformer
        // But registry.negotiate() already falls back to default if * / * or no match found?
        // Actually registry.negotiate returns undefined if no match and no default.

        if (!transformer) {
            // Fallback to JSON if negotiation completely fails
            // This ensures we always send something
            return this.json(data, status, headers);
        }

        // Serialize data
        const resolvedData = data instanceof Promise ? await data : data;
        const { body, headers: transformerHeaders } = await transformer.serialize(resolvedData);

        const finalStatus = status ?? this.response.status ?? 200;

        // Validate redirect status code
        if (this.app?.applicationConfig?.validateStatusCodes && !VALID_HTTP_STATUSES.has(finalStatus)) {
            throw new Error(`Invalid HTTP status code: ${finalStatus}`);
        }
        this.response.status = finalStatus;

        // Store raw body for compression
        if (typeof body === "string" || body instanceof ArrayBuffer || body instanceof Uint8Array) {
            this[$rawBody] = body;
        }

        // Merge headers
        const finalHeaders = this.mergeHeaders(headers);
        if (transformerHeaders) {
            Object.entries(transformerHeaders).forEach(([k, v]) => finalHeaders.set(k, v));
        }

        this[$finalResponse] = new Response(body as any, { status: finalStatus, headers: finalHeaders });
        return this[$finalResponse];
    }

    /**
     * Send a response
     * @param body Response body
     * @param options Response options
     * @returns Response
     */
    send(body?: BodyInit, options?: ResponseInit) {
        const headers = this.mergeHeaders(options?.headers as any);
        const status = options?.status ?? this.response.status ?? 200;

        // Validate redirect status code
        if (this.app.applicationConfig.validateStatusCodes && !VALID_HTTP_STATUSES.has(status)) {
            throw new Error(`Invalid HTTP status code: ${status}`);
        }

        // Store raw body for compression middleware
        if (typeof body === "string" || body instanceof ArrayBuffer || body instanceof Uint8Array) {
            this[$rawBody] = body;
        }

        // :as any because there are multiple bodyinit providers. What the hell.
        return this[$finalResponse] ??= new Response(body as any, { status, headers });
    }

    /**
     * Emit an event to the client (WebSocket only)
     * @param event Event name
     * @param data Event data (Must be JSON serializable)
     */
    emit(event: string, data?: any) {
        if (this[$ws]) {
            this[$ws].send(JSON.stringify({ event, data }));
        } else if (this[$socket]) {
            this[$socket].emit(event, data);
        }
    }

    /**
     * Respond with a JSON object
     */
    async json(data: object | Promise<object>, status?: number, headers?: HeadersInit) {
        // Auto-negotiation check
        if (this.app?.applicationConfig?.enableAutoContentNegotiation) {
            return this.respond(data, status, headers);
        }

        const finalStatus = status ?? this.response.status ?? 200;
        // Validate redirect status code
        if (!VALID_HTTP_STATUSES.has(finalStatus)) {
            throw new Error(`Invalid HTTP status code: ${finalStatus}`);
        }
        this.response.status = finalStatus;

        const jsonString = JSON.stringify(data instanceof Promise ? await data : data);

        // Store raw body for compression middleware
        this[$rawBody] = jsonString;

        // Fast path: no custom headers and no response headers set
        if (!headers && !this.response.hasPopulatedHeaders) {
            this[$finalResponse] = new Response(jsonString, {
                status: finalStatus,
                headers: { "content-type": "application/json" }
            });
            return this[$finalResponse];
        }

        // Slow path: merge headers
        const finalHeaders = this.mergeHeaders(headers);
        finalHeaders.set("content-type", "application/json");
        this[$finalResponse] = new Response(jsonString, { status: finalStatus, headers: finalHeaders });
        return this[$finalResponse];
    }

    /**
     * Respond with a text string
     */
    async text(data: string | Promise<string>, status?: number, headers?: HeadersInit) {
        const finalStatus = status ?? this.response.status ?? 200;

        // Validate redirect status code
        if (this.app.applicationConfig.validateStatusCodes && !VALID_HTTP_STATUSES.has(finalStatus)) {
            throw new Error(`Invalid HTTP status code: ${finalStatus}`);
        }
        this.response.status = finalStatus;

        // Store raw body for compression middleware
        this[$rawBody] = data instanceof Promise ? await data : data;

        // Fast path: no custom headers and no response headers set
        if (!headers && !this.response.hasPopulatedHeaders) {
            this[$finalResponse] = new Response(this[$rawBody], {
                status: finalStatus,
                headers: { "content-type": "text/plain; charset=utf-8" }
            });
            return this[$finalResponse];
        }

        // Slow path: merge headers
        const finalHeaders = this.mergeHeaders(headers);
        finalHeaders.set("content-type", "text/plain; charset=utf-8");
        this[$finalResponse] = new Response(this[$rawBody], { status: finalStatus, headers: finalHeaders });
        return this[$finalResponse];
    }

    /**
     * Respond with HTML content
     */
    async html(html: string | Promise<string>, status?: number, headers?: HeadersInit) {
        const finalStatus = status ?? this.response.status ?? 200;

        // Validate redirect status code
        if (this.app.applicationConfig.validateStatusCodes && !VALID_HTTP_STATUSES.has(finalStatus)) {
            throw new Error(`Invalid HTTP status code: ${finalStatus}`);
        }
        this.response.status = finalStatus;

        const finalHeaders = this.mergeHeaders(headers);
        finalHeaders.set("content-type", "text/html; charset=utf-8");

        // Store raw body for compression middleware
        this[$rawBody] = html instanceof Promise ? await html : html;

        this[$finalResponse] = new Response(this[$rawBody], { status: finalStatus, headers: finalHeaders });
        return this[$finalResponse];
    }

    /**
     * Respond with a redirect
     */
    async redirect(url: string | Promise<string>, status = 302) {
        // Validate redirect status code
        if (this.app.applicationConfig.validateStatusCodes && !VALID_REDIRECT_STATUSES.has(status)) {
            throw new Error(`Invalid redirect status code: ${status}`);
        }
        this.response.status = status;

        const finalHeaders = this.mergeHeaders();
        const targetUrl = url instanceof Promise ? await url : url;

        // Security: Prevent Open Redirects & XSS via redirect
        // Block protocol-relative URLs (//evil.com) which browsers treat as same-scheme
        if (targetUrl.startsWith('//')) {
            // We could rewrite to / or throw. Throwing is safer/clearer.
            throw new Error("Invalid redirect: Protocol-relative URLs are not allowed.");
        }

        // Block dangerous pseudo-protocols
        const lowerUrl = targetUrl.toLowerCase();
        if (lowerUrl.startsWith('javascript:') || lowerUrl.startsWith('data:') || lowerUrl.startsWith('vbscript:')) {
            throw new Error(`Invalid redirect: Unsafe protocol '${targetUrl.split(':')[0]}'`);
        }

        finalHeaders.set('Location', targetUrl);

        this[$finalResponse] = new Response(null, { status, headers: finalHeaders });
        return this[$finalResponse];
    }

    /**
     * Respond with a status code
     * DOES NOT CHAIN!
     */
    async status(statusCode: number | Promise<number>) {
        const status = statusCode instanceof Promise ? await statusCode : statusCode;
        // Validate redirect status code
        if (this.app.applicationConfig.validateStatusCodes && !VALID_HTTP_STATUSES.has(status)) {
            throw new Error(`Invalid HTTP status code: ${status}`);
        }
        this.response.status = status;

        const finalHeaders = this.mergeHeaders();
        this[$finalResponse] = new Response(null, { status, headers: finalHeaders });
        return this[$finalResponse];
    }

    /**
     * Respond with a file
     */
    public async file(path: string, fileOptions?: BlobPropertyBag, responseOptions?: ResponseInit) {
        const finalHeaders = this.mergeHeaders(responseOptions?.headers as any);
        const status = responseOptions?.status ?? this.response.status;

        // Validate redirect status code
        if (this.app.applicationConfig.validateStatusCodes && !VALID_HTTP_STATUSES.has(status)) {
            throw new Error(`Invalid HTTP status code: ${status}`);
        }
        // status is optional in file responseOptions, so only update if defined, otherwise keep existing
        if (status) this.response.status = status;

        if (typeof Bun !== "undefined") {
            this[$finalResponse] = new Response(Bun.file(path, fileOptions), { status, headers: finalHeaders });
            return this[$finalResponse];
        } else {
            // Node.js fallback using fs
            const fileBuffer = await readFile(path);

            // Set content-type from fileOptions if provided
            if (fileOptions?.type) {
                finalHeaders.set('content-type', fileOptions.type);
            }

            this[$finalResponse] = new Response(fileBuffer, { status, headers: finalHeaders });
            return this[$finalResponse];
        }
    }

    /**
     * Render a JSX element
     * @param element JSX Element
     * @param args JSX Element Args/Props
     * @param status HTTP Status
     * @param headers HTTP Headers
     */
    public async jsx(element: any, args?: Parameters<JSXRenderer>[1], status?: number, headers?: HeadersInit) {
        status ??= 200;

        // Validate redirect status code
        if (this.app.applicationConfig.validateStatusCodes && !VALID_HTTP_STATUSES.has(status)) {
            throw new Error(`Invalid HTTP status code: ${status}`);
        }
        if (!this.renderer) {
            throw new Error("No JSX renderer configured");
        }

        const html = await this.renderer(element, args);
        return this.html(html, status, headers); // html() already stores _rawBody
    }

    /**
     * Pipe a ReadableStream to the response
     * @param stream ReadableStream to pipe
     * @param options Response options (status, headers)
     */
    public pipe(stream: ReadableStream, options?: ResponseInit): Response {
        const headers = this.mergeHeaders(options?.headers as any);
        const status = options?.status ?? this.response.status ?? 200;

        if (this.app?.applicationConfig?.validateStatusCodes && !VALID_HTTP_STATUSES.has(status)) {
            throw new Error(`Invalid HTTP status code: ${status}`);
        }

        this[$finalResponse] = new Response(stream, { status, headers });
        return this[$finalResponse];
    }

    /**
     * Internal helper to create a streaming response with common infrastructure
     * @private
     */
    private createStreamHelper<THelper>(
        helperFactory: (
            controller: ReadableStreamDefaultController,
            aborted: { value: boolean; },
            abortCallbacks: (() => void)[],
            encoder: TextEncoder
        ) => THelper,
        callback: (helper: THelper) => Promise<void> | void,
        onError?: (err: Error, helper: THelper) => void | Promise<void>,
        headers?: HeadersInit
    ): Response {
        let controller: ReadableStreamDefaultController;
        const aborted = { value: false }; // Use object for reference sharing
        const abortCallbacks: (() => void)[] = [];
        const encoder = new TextEncoder();
        let helper: THelper;

        const stream = new ReadableStream({
            start(ctrl) {
                controller = ctrl;
                // Create helper after controller is initialized
                helper = helperFactory(controller, aborted, abortCallbacks, encoder);

                // Execute callback asynchronously
                (async () => {
                    try {
                        await callback(helper);
                        controller.close();
                    } catch (err) {
                        if (onError) {
                            try {
                                await onError(err as Error, helper);
                            } catch (handlerErr) {
                                console.error('Error in stream error handler:', handlerErr);
                            }
                        } else {
                            console.error('Stream error:', err);
                        }
                        if (!aborted.value) {
                            controller.close();
                        }
                    }
                })();
            },
            async pull() {
                // Stream is ready for more data
            },
            cancel() {
                aborted.value = true;
                abortCallbacks.forEach(cb => {
                    try {
                        cb();
                    } catch (err) {
                        console.error('Error in abort callback:', err);
                    }
                });
            }
        });

        return this.pipe(stream, { headers });
    }

    /**
     * Generic streaming helper for binary/text data
     * @param callback Callback function that receives a StreamHelper
     * @param onError Optional error handler
     */
    public stream(
        callback: (stream: StreamHelper) => Promise<void> | void,
        onError?: StreamErrorHandler
    ): Response {
        return this.createStreamHelper<StreamHelper>(
            (controller, aborted, abortCallbacks, encoder) => ({
                async write(data: Uint8Array | string): Promise<void> {
                    if (aborted.value) return;
                    const chunk = typeof data === 'string' ? encoder.encode(data) : data;
                    controller.enqueue(chunk);
                },
                async pipe(stream: ReadableStream): Promise<void> {
                    if (aborted.value) return;
                    const reader = stream.getReader();
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done || aborted.value) break;
                            controller.enqueue(value);
                        }
                    } finally {
                        reader.releaseLock();
                    }
                },
                sleep(ms: number): Promise<void> {
                    return new Promise(resolve => setTimeout(resolve, ms));
                },
                onAbort(callback: () => void): void {
                    abortCallbacks.push(callback);
                }
            }),
            callback,
            onError
        );
    }

    /**
     * Text streaming helper with proper headers
     * @param callback Callback function that receives a TextStreamHelper
     * @param onError Optional error handler
     */
    public streamText(
        callback: (stream: TextStreamHelper) => Promise<void> | void,
        onError?: TextStreamErrorHandler
    ): Response {
        const headers = new Headers(this.response.headers);
        headers.set('Content-Type', 'text/plain; charset=utf-8');
        headers.set('Transfer-Encoding', 'chunked');
        headers.set('X-Content-Type-Options', 'nosniff');

        return this.createStreamHelper<TextStreamHelper>(
            (controller, aborted, abortCallbacks, encoder) => ({
                async write(text: string): Promise<void> {
                    if (aborted.value) return;
                    controller.enqueue(encoder.encode(text));
                },
                async writeln(text: string): Promise<void> {
                    if (aborted.value) return;
                    controller.enqueue(encoder.encode(text + '\n'));
                },
                sleep(ms: number): Promise<void> {
                    return new Promise(resolve => setTimeout(resolve, ms));
                },
                onAbort(callback: () => void): void {
                    abortCallbacks.push(callback);
                }
            }),
            callback,
            onError,
            headers
        );
    }

    /**
     * Server-Sent Events (SSE) streaming helper
     * @param callback Callback function that receives an SSEStreamHelper
     * @param onError Optional error handler
     */
    public streamSSE(
        callback: (stream: SSEStreamHelper) => Promise<void> | void,
        onError?: SSEStreamErrorHandler
    ): Response {
        const headers = new Headers(this.response.headers);
        headers.set('Content-Type', 'text/event-stream');
        headers.set('Cache-Control', 'no-cache');
        headers.set('Connection', 'keep-alive');

        return this.createStreamHelper<SSEStreamHelper>(
            (controller, aborted, abortCallbacks, encoder) => ({
                async writeSSE(message: SSEMessage): Promise<void> {
                    if (aborted.value) return;

                    let sseMessage = '';

                    // Format according to SSE spec
                    if (message.event) {
                        sseMessage += `event: ${message.event}\n`;
                    }
                    if (message.id !== undefined) {
                        sseMessage += `id: ${message.id}\n`;
                    }
                    if (message.retry !== undefined) {
                        sseMessage += `retry: ${message.retry}\n`;
                    }

                    // Data can be multi-line, each line prefixed with "data: "
                    const dataLines = message.data.split('\n');
                    for (const line of dataLines) {
                        sseMessage += `data: ${line}\n`;
                    }

                    // SSE messages end with double newline
                    sseMessage += '\n';

                    controller.enqueue(encoder.encode(sseMessage));
                },
                sleep(ms: number): Promise<void> {
                    return new Promise(resolve => setTimeout(resolve, ms));
                },
                onAbort(callback: () => void): void {
                    abortCallbacks.push(callback);
                }
            }),
            callback,
            onError,
            headers
        );
    }
}
