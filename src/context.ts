import type { BodyInit, Server } from 'bun';
import { readFile } from 'node:fs/promises';
import type { ShokupanRequest } from './request';
import { ShokupanResponse } from './response';
import type { Shokupan } from './shokupan';
import type { CookieOptions, JSXRenderer } from './types';

// Shim for HeadersInit if not available globally in some envs
type HeadersInit = Headers | Record<string, string> | [string, string][];


export interface HandlerStackItem {
    name: string;
    file: string;
    line: number;
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

export class ShokupanContext<State extends Record<string, any> = Record<string, any>> {
    private _url: URL | undefined;
    public params: Record<string, string> = {}; // Router assigns this, but default to empty object
    public state: State;
    public handlerStack: HandlerStackItem[] = [];

    public readonly response: ShokupanResponse;
    public _debug?: DebugCollector;
    public _finalResponse?: Response;
    public _rawBody?: string | ArrayBuffer | Uint8Array; // Raw body for compression optimization

    // Body caching to avoid double parsing
    private _cachedBody?: any;
    private _bodyType?: 'json' | 'text' | 'formData' | 'arrayBuffer' | 'blob';
    private _bodyParsed: boolean = false;

    constructor(
        public readonly request: ShokupanRequest<any>,
        public readonly server?: Server,
        state?: State,
        public readonly app?: Shokupan,
        public readonly signal?: AbortSignal, // Optional as it might not be provided in tests or simple creates
        enableMiddlewareTracking: boolean = false
    ) {
        this.state = state || {} as State;
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
        if (!this._url) {
            // WebSocket contexts may have empty request URLs
            const urlString = this.request.url || 'http://localhost/';
            this._url = new URL(urlString);
        }
        return this._url;
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
        if (this._url) return this._url.pathname;

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
        const q: Record<string, any> = {};
        for (const [key, value] of this.url.searchParams) {
            if (q[key] === undefined) {
                q[key] = value;
            } else if (Array.isArray(q[key])) {
                q[key].push(value);
            } else {
                q[key] = [q[key], value];
            }
        }
        return q;
    }

    /**
     * Client IP address
     */
    get ip() { return this.server?.requestIP(this.request as unknown as Request); }

    /**
     * Request hostname (e.g. "localhost")
     */
    get hostname() { return this.url.hostname; }

    /**
     * Request host (e.g. "localhost:3000")
     */
    get host() { return this.url.host; }

    /**
     * Request protocol (e.g. "http:", "https:")
     */
    get protocol() { return this.url.protocol; }

    /**
     * Whether request is secure (https)
     */
    get secure() { return this.url.protocol === 'https:'; }

    /**
     * Request origin (e.g. "http://localhost:3000")
     */
    get origin() { return this.url.origin; }

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
     * Helper to set a header on the response
     * @param key Header key
     * @param value Header value
     */
    public set(key: string, value: string) {
        this.response.set(key, value);
        return this;
    }

    /**
     * Set a cookie
     * @param name Cookie name
     * @param value Cookie value
     * @param options Cookie options
     */
    public setCookie(name: string, value: string, options: CookieOptions = {}) {
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
     * Send a response
     * @param body Response body
     * @param options Response options
     * @returns Response
     */
    public send(body?: BodyInit, options?: ResponseInit) {
        const headers = this.mergeHeaders(options?.headers as any);
        const status = options?.status ?? this.response.status;

        // Store raw body for compression middleware
        if (typeof body === "string" || body instanceof ArrayBuffer || body instanceof Uint8Array) {
            this._rawBody = body;
        }

        this._finalResponse = new Response(body, { status, headers });
        return this._finalResponse;
    }

    /**
     * Read request body with caching to avoid double parsing.
     * The body is only parsed once and cached for subsequent reads.
     */
    async body<T = any>(): Promise<T> {
        // Return cached body if already parsed
        if (this._bodyParsed) {
            return this._cachedBody as T;
        }

        const contentType = this.request.headers.get("content-type") || "";

        if (contentType.includes("application/json") || contentType.includes("+json")) {
            this._cachedBody = await this.request.json();
            this._bodyType = 'json';
        } else if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
            this._cachedBody = await this.request.formData();
            this._bodyType = 'formData';
        } else {
            this._cachedBody = await this.request.text();
            this._bodyType = 'text';
        }

        this._bodyParsed = true;
        return this._cachedBody as T;
    }

    /**
     * Respond with a JSON object
     */
    json(data: any, status?: number, headers?: HeadersInit) {
        const finalStatus = status ?? this.response.status;
        const jsonString = JSON.stringify(data);

        // Store raw body for compression middleware
        this._rawBody = jsonString;

        // Fast path: no custom headers and no response headers set
        if (!headers && !this.response.hasPopulatedHeaders) {
            this._finalResponse = new Response(jsonString, {
                status: finalStatus,
                headers: { "content-type": "application/json" }
            });
            return this._finalResponse;
        }

        // Slow path: merge headers
        const finalHeaders = this.mergeHeaders(headers);
        finalHeaders.set("content-type", "application/json");
        this._finalResponse = new Response(jsonString, { status: finalStatus, headers: finalHeaders });
        return this._finalResponse;
    }

    /**
     * Respond with a text string
     */
    text(data: string, status?: number, headers?: HeadersInit) {
        const finalStatus = status ?? this.response.status;

        // Store raw body for compression middleware
        this._rawBody = data;

        // Fast path: no custom headers and no response headers set
        if (!headers && !this.response.hasPopulatedHeaders) {
            this._finalResponse = new Response(data, {
                status: finalStatus,
                headers: { "content-type": "text/plain; charset=utf-8" }
            });
            return this._finalResponse;
        }

        // Slow path: merge headers
        const finalHeaders = this.mergeHeaders(headers);
        finalHeaders.set("content-type", "text/plain; charset=utf-8");
        this._finalResponse = new Response(data, { status: finalStatus, headers: finalHeaders });
        return this._finalResponse;
    }

    /**
     * Respond with HTML content
     */
    html(html: string, status?: number, headers?: HeadersInit) {
        const finalStatus = status ?? this.response.status;
        const finalHeaders = this.mergeHeaders(headers);
        finalHeaders.set("content-type", "text/html; charset=utf-8");

        // Store raw body for compression middleware
        this._rawBody = html;

        this._finalResponse = new Response(html, { status: finalStatus, headers: finalHeaders });
        return this._finalResponse;
    }

    /**
     * Respond with a redirect
     */
    redirect(url: string, status = 302) {
        const headers = this.mergeHeaders();
        headers.set('Location', url);
        this._finalResponse = new Response(null, { status, headers });
        return this._finalResponse;
    }

    /**
     * Respond with a status code
     * DOES NOT CHAIN!
     */
    status(status: number) {
        const headers = this.mergeHeaders();
        this._finalResponse = new Response(null, { status, headers });
        return this._finalResponse;
    }

    /**
     * Respond with a file
     */
    public async file(path: string, fileOptions?: BlobPropertyBag, responseOptions?: ResponseInit) {
        const headers = this.mergeHeaders(responseOptions?.headers as any);
        const status = responseOptions?.status ?? this.response.status;

        if (typeof Bun !== "undefined") {
            this._finalResponse = new Response(Bun.file(path, fileOptions), { status, headers });
            return this._finalResponse;
        } else {
            // Node.js fallback using fs
            const fileBuffer = await readFile(path);

            // Set content-type from fileOptions if provided
            if (fileOptions?.type) {
                headers.set('content-type', fileOptions.type);
            }

            this._finalResponse = new Response(fileBuffer, { status, headers });
            return this._finalResponse;
        }
    }

    /**
     * JSX Rendering Function
     */
    public renderer?: JSXRenderer;

    /**
     * Render a JSX element
     * @param element JSX Element
     * @param status HTTP Status
     * @param headers HTTP Headers
     */
    public async jsx(element: any, args?: Parameters<JSXRenderer>[1], status?: number, headers?: HeadersInit) {
        if (!this.renderer) {
            throw new Error("No JSX renderer configured");
        }

        const html = await this.renderer(element, args);
        return this.html(html, status, headers); // html() already stores _rawBody
    }
}
