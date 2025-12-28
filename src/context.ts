
import type { BodyInit, Server } from 'bun';
import type { ShokupanRequest } from './request';
import { ShokupanResponse } from './response';
import type { CookieOptions, JSXRenderer } from './types';

// Shim for HeadersInit if not available globally in some envs
type HeadersInit = Headers | Record<string, string> | [string, string][];

export class ShokupanContext<State extends Record<string, any> = Record<string, any>> {
    public readonly url: URL;
    public params: Record<string, string> = {};
    public state: State;

    public readonly response: ShokupanResponse;

    constructor(
        public readonly request: ShokupanRequest<any>,
        public readonly server?: Server,
        state?: State
    ) {
        this.url = new URL(request.url);
        this.state = state || {} as State;
        this.response = new ShokupanResponse();
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
    get path() { return this.url.pathname; }
    /**
     * Request query params
     */
    get query() { return Object.fromEntries(this.url.searchParams); }

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
        let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

        if (options.maxAge) cookie += `; Max-Age=${Math.floor(options.maxAge)}`;
        if (options.expires) cookie += `; Expires=${options.expires.toUTCString()}`;
        if (options.httpOnly) cookie += `; HttpOnly`;
        if (options.secure) cookie += `; Secure`;
        if (options.domain) cookie += `; Domain=${options.domain}`;
        if (options.path) cookie += `; Path=${options.path || '/'}`;
        if (options.sameSite) {
            const sameSite = typeof options.sameSite === 'string'
                ? options.sameSite.toLowerCase()
                : options.sameSite
                    ? 'strict'
                    : 'lax'; // Default logic if boolean true, though usually explicit string is better
            // Ideally follow specific behavior: express-session/cookies uses boolean to mean strict/lax sometimes?
            // Let's stick to standard strings mostly, but maybe map boolean to Strict/Lax?
            // Standard: SameSite=Lax (default if missing but we are setting it only if present)
            // If strictly boolean true -> Strict, false -> (don't set? or None? usually don't set)
            cookie += `; SameSite=${typeof options.sameSite === 'boolean' ? 'Strict' : (options.sameSite.charAt(0).toUpperCase() + options.sameSite.slice(1))}`;
        }
        if (options.priority) {
            cookie += `; Priority=${options.priority.charAt(0).toUpperCase() + options.priority.slice(1)}`;
        }

        this.response.append('Set-Cookie', cookie);
        return this;
    }

    private mergeHeaders(headers?: HeadersInit): Headers {
        const h = new Headers(this.response.headers);
        if (headers) {
            new Headers(headers).forEach((v, k) => h.set(k, v));
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
        return new Response(body, { status, headers });
    }

    /**
     * Read request body
     */
    async body<T = any>(): Promise<T> {
        const contentType = this.request.headers.get("content-type");
        if (contentType?.includes("application/json")) {
            return this.request.json() as any;
        }
        if (contentType?.includes("multipart/form-data") || contentType?.includes("application/x-www-form-urlencoded")) {
            return this.request.formData() as any;
        }
        return this.request.text() as any;
    }

    /**
     * Respond with a JSON object
     */
    json(data: any, status?: number, headers?: HeadersInit) {
        const finalHeaders = this.mergeHeaders(headers);
        finalHeaders.set("content-type", "application/json");
        const finalStatus = status ?? this.response.status;
        return new Response(JSON.stringify(data), { status: finalStatus, headers: finalHeaders });
    }

    /**
     * Respond with a text string
     */
    text(data: string, status?: number, headers?: HeadersInit) {
        const finalHeaders = this.mergeHeaders(headers);
        finalHeaders.set("content-type", "text/plain");
        const finalStatus = status ?? this.response.status;
        return new Response(data, { status: finalStatus, headers: finalHeaders });
    }

    /**
     * Respond with HTML content
     */
    html(html: string, status?: number, headers?: HeadersInit) {
        const finalHeaders = this.mergeHeaders(headers);
        finalHeaders.set("content-type", "text/html");
        const finalStatus = status ?? this.response.status;
        return new Response(html, { status: finalStatus, headers: finalHeaders });
    }

    /**
     * Respond with a redirect
     */
    redirect(url: string, status = 302) {
        const headers = this.mergeHeaders();
        headers.set('Location', url);
        return new Response(null, { status, headers });
    }

    /**
     * Respond with a status code
     * DOES NOT CHAIN!
     */
    status(status: number) {
        const headers = this.mergeHeaders();
        return new Response(null, { status, headers });
    }

    /**
     * Respond with a file
     */
    public file(path: string, fileOptions?: BlobPropertyBag, responseOptions?: ResponseInit) {
        const headers = this.mergeHeaders(responseOptions?.headers as any);
        const status = responseOptions?.status ?? this.response.status;
        return new Response(Bun.file(path, fileOptions), { status, headers });
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
        return this.html(html, status, headers);
    }
}
