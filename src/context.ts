
import type { BodyInit } from 'bun';
import type { ConvectionRequest } from './request';
import { ConvectionResponse } from './response';

// Shim for HeadersInit if not available globally in some envs
type HeadersInit = Headers | Record<string, string> | [string, string][];

export class ConvectionContext<State extends Record<string, any> = Record<string, any>> {
    public readonly url: URL;
    public params: Record<string, string> = {};
    public state: State;

    public readonly response: ConvectionResponse;

    constructor(
        public readonly request: ConvectionRequest<any>,
        state?: State
    ) {
        this.url = new URL(request.url);
        this.state = state || {} as State;
        this.response = new ConvectionResponse();
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
     * Request headers
     */
    get headers() { return this.request.headers; }

    /**
     * Base response object
     */
    get res() { return this.response; }

    /**
     * Helper to set a header on the response
     */
    public set(key: string, value: string) {
        this.response.set(key, value);
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
        if (this.request.headers.get("content-type")?.includes("application/json")) {
            return this.request.json() as any;
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
    file(path: string, options?: ResponseInit) {
        const headers = this.mergeHeaders(options?.headers as any);
        const status = options?.status ?? this.response.status;
        return new Response(Bun.file(path), { status, headers });
    }
}
