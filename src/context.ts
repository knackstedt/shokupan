import type { BodyInit, Server, ServerWebSocket } from 'bun';
import { nanoid } from 'nanoid';
import { readFile } from 'node:fs/promises';
import { inspect } from 'node:util';
import type { Socket, Server as SocketServer } from 'socket.io';
import type { Shokupan } from './shokupan';
import { VALID_HTTP_STATUSES, VALID_REDIRECT_STATUSES } from './util/http-status';
import type { ShokupanRequest } from './util/request';
import { ShokupanResponse } from './util/response';
import { $bodyParsed, $bodyParseError, $bodyType, $cachedBody, $cachedCookies, $cachedHost, $cachedHostname, $cachedOrigin, $cachedProtocol, $cachedQuery, $debug, $finalResponse, $io, $rawBody, $requestId, $routeMatched, $socket, $url, $ws } from './util/symbol';
import type { CookieOptions, HeadersInit, JSXRenderer } from './util/types';

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

        // Security: Use Object.create(null) to prevent prototype pollution
        const q: Record<string, any> = Object.create(null);

        // Security: Blocklist dangerous property names
        const blocklist = ['__proto__', 'constructor', 'prototype'];
        const mode = this.app?.applicationConfig?.queryParserMode || 'extended';

        this.url.searchParams.forEach((value, key) => {
            // Security: Skip dangerous keys
            if (blocklist.includes(key)) return;

            // Use hasOwnProperty to avoid prototype chain issues
            if (Object.prototype.hasOwnProperty.call(q, key)) {
                if (mode === 'strict') {
                    throw new Error(`Duplicate query parameter '${key}' is not allowed in strict mode.`);
                } else if (mode === 'simple') {
                    // Start of list? End of list? Usually first occurrence wins or last. 
                    // Let's stick to "first wins" or "last wins". 
                    // URLSearchParams iteration order is insertion order.
                    // If we want "last wins" (standard JS object behavior), we just overwrite.
                    // If we want "first wins", we skip.
                    // Let's do "last wins" (overwrite) to match standard `Object.fromEntries` behavior usually expected if not handling arrays.
                    q[key] = value;
                } else {
                    // Extended (Array)
                    if (Array.isArray(q[key])) {
                        q[key].push(value);
                    } else {
                        q[key] = [q[key], value];
                    }
                }
            } else {
                q[key] = value;
            }
        });
        this[$cachedQuery] = q;
        return q;
    }

    /**
     * Request cookies
     */
    get cookies() {
        if (this[$cachedCookies]) return this[$cachedCookies];

        const c: Record<string, string> = Object.create(null);
        const cookieHeader = this.request.headers.get("cookie");

        if (cookieHeader) {
            const pairs = cookieHeader.split(";");
            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                const index = pair.indexOf("=");
                if (index > 0) {
                    const key = pair.slice(0, index).trim();
                    const value = pair.slice(index + 1).trim();
                    c[key] = decodeURIComponent(value);
                }
            }
        }

        this[$cachedCookies] = c;
        return c;
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
     * @param options Upgrade options
     * @returns true if upgraded, false otherwise
     */
    public upgrade(options?: { data?: any; headers?: HeadersInit; }) {
        if (!this.server) return false;
        const success = this.server.upgrade(this.req as any, options);
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
    async body<T = any>(): Promise<T> {
        // If there was an error during pre-parsing, throw it now
        if (this[$bodyParseError] !== undefined) {
            throw this[$bodyParseError];
        }

        // Return cached body if already parsed
        if (this[$bodyParsed] === true) {
            return this[$cachedBody] as T;
        }

        const contentType = this.request.headers.get("content-type") || "";

        if (contentType.includes("application/json") || contentType.includes("+json")) {
            const parserType = this.app?.applicationConfig?.jsonParser || 'native';

            // To enforce maxBodySize, we must read the raw body ourselves
            // native request.json() might read everything without limit check (depending on runtime)
            // safer to read text with limit, then parse.

            const rawText = await this.readRawBody();

            if (parserType === 'native') {
                try {
                    // Handle empty body definition
                    if (!rawText) return {} as any;
                    this[$cachedBody] = JSON.parse(rawText);
                } catch (e) {
                    throw e;
                }
            } else {
                const { getJSONParser } = await import('./util/json-parser');
                const parser = getJSONParser(parserType);
                this[$cachedBody] = parser(rawText);
            }

            this[$bodyType] = 'json';
        } else if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
            // FormData limit check is harder as we want browser to parse it.
            // But we can check Content-Length at least.
            const maxBodySize = this.app?.applicationConfig?.maxBodySize ?? 10 * 1024 * 1024;
            const cl = parseInt(this.request.headers.get("content-length") || "0", 10);
            if (cl > maxBodySize) {
                const err = new Error("Payload Too Large");
                (err as any).status = 413;
                throw err;
            }
            // NOTE: if CL is missing or lying (chunked), this might still read valid FormData until OOM in native parser. 
            // Implementing streaming FormData parser is out of scope for "hardening" phase.

            this[$cachedBody] = await this.request.formData();
            this[$bodyType] = 'formData';
        } else {
            // Use readRawBody for text to enforce limit
            this[$cachedBody] = await this.readRawBody();
            this[$bodyType] = 'text';
        }

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
     * Read raw body from ReadableStream efficiently.
     * This is much faster than request.text() for large payloads.
     * Also handles the case where body is already a string (e.g., in tests).
     */
    private async readRawBody(): Promise<string> {
        const maxBodySize = this.app?.applicationConfig?.maxBodySize ?? 10 * 1024 * 1024;

        // Handle test case where body is already a string
        if (typeof (this.request as any).body === 'string') {
            const body = (this.request as any).body;
            if (body.length > maxBodySize) {
                const err = new Error("Payload Too Large");
                (err as any).status = 413;
                throw err;
            }
            return body;
        }

        const reader = this.request.body?.getReader();
        if (!reader) {
            return '';
        }

        const chunks: Uint8Array[] = [];
        let totalSize = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                totalSize += value.length;
                if (totalSize > maxBodySize) {
                    const err = new Error("Payload Too Large");
                    (err as any).status = 413;
                    throw err;
                }

                chunks.push(value);
            }
        } finally {
            reader.releaseLock();
        }

        // Efficiently combine chunks into single buffer
        const result = new Uint8Array(totalSize);
        let offset = 0;
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return new TextDecoder().decode(result);
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
}
