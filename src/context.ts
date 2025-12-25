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

    // --- Request Helpers ---

    get req() { return this.request; }
    get method() { return this.request.method; }
    get path() { return this.url.pathname; }
    get query() { return Object.fromEntries(this.url.searchParams); }
    get headers() { return this.request.headers; }

    async body<T = any>(): Promise<T> {
        if (this.request.headers.get("content-type")?.includes("application/json")) {
            return this.request.json() as any;
        }
        return this.request.text() as any;
    }

    // --- Response Helpers ---

    json(data: any, status = 200, headers?: HeadersInit) {
        return Response.json(data, { status, headers });
    }

    text(data: string, status = 200, headers?: HeadersInit) {
        return new Response(data, { status, headers });
    }

    redirect(url: string, status = 302) {
        return Response.redirect(url, status);
    }

    status(status: number) {
        return new Response(null, { status });
    }
}
