import type { ConvectionRequest } from './request';

// Shim for HeadersInit if not available globally in some envs
type HeadersInit = Headers | Record<string, string> | [string, string][];

export class ConvectionContext<State = any> {
    public readonly url: URL;
    public params: Record<string, string> = {};
    public state: State;

    constructor(public readonly request: ConvectionRequest<any>, state?: State) {
        this.url = new URL(request.url);
        this.state = state || {} as State;
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
     * Request body
     */
    async body<T = any>(): Promise<T> {
        if (this.request.headers.get("content-type")?.includes("application/json")) {
            return this.request.json() as any;
        }
        return this.request.text() as any;
    }

    /**
     * JSON response
     */
    json(data: any, status = 200, headers?: HeadersInit) {
        headers = {
            ...headers,
            "content-type": "application/json"
        };
        return new Response(JSON.stringify(data), { status, headers });
    }

    /**
     * Text response
     */
    text(data: string, status = 200, headers?: HeadersInit) {
        headers = {
            ...headers,
            "content-type": "text/plain"
        };
        return new Response(data, { status, headers });
    }

    /**
     * HTML response (string)
     */
    html(html: string, status = 200, headers?: HeadersInit) {
        headers = {
            ...headers,
            "content-type": "text/html"
        };
        return new Response(html, { status, headers });
    }

    /**
     * Redirect response
     */
    redirect(url: string, status = 302) {
        return Response.redirect(url, status);
    }

    /**
     * Status response
     */
    status(status: number) {
        return new Response(null, { status });
    }

    /**
     * File response
     */
    file(path: string, options?: ResponseInit) {
        return new Response(Bun.file(path), options);
    }
}
