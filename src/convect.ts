import { ConvectionContext } from "./context";
import { compose } from "./middleware";
import { ConvectionRequest } from './request';
import { ConvectionRouter } from "./router";
import { $appRoot, $dispatch, $isApplication } from './symbol';
import { asyncContext, getTracer } from "./telemetry";
import type { ConvectionConfig, Method, Middleware, ProcessResult, RequestOptions } from './types';

const defaults: ConvectionConfig = {
    port: 3000,
    hostname: "localhost",
    development: process.env.NODE_ENV !== "production",
    enableAsyncLocalStorage: false,
};

export class Convection<T = any> extends ConvectionRouter<T> {
    readonly applicationConfig: ConvectionConfig = {};
    private middleware: Middleware[] = [];

    constructor(
        applicationConfig: ConvectionConfig = {}
    ) {
        super();
        this[$isApplication] = true;
        this[$appRoot] = this;
        Object.assign(this.applicationConfig, defaults, applicationConfig);
    }

    /**
     * Adds middleware to the application.
     */
    public use(middleware: Middleware) {
        this.middleware.push(middleware);
    }

    /**
     * Starts the application server.
     * 
     * @param port - The port to listen on. If not specified, the port from the configuration is used. If that is not specified, port 3000 is used.
     * @returns The server instance.
     */
    public listen(port?: number) {
        const finalPort = port || this.applicationConfig.port || 3000;

        if (finalPort < 0 || finalPort > 65535) {
            throw new Error("Invalid port number");
        }

        if (port === 0 && process.platform === "linux") {

        }

        const server = Bun.serve({
            port: finalPort,
            hostname: this.applicationConfig.hostname,
            development: this.applicationConfig.development,
            fetch: this.fetch.bind(this),
        });

        console.log(`Convect server listening on http://${server.hostname}:${server.port}`);
        return server;
    }

    public [$dispatch](req: ConvectionRequest<T>) {
        return this.fetch(req as unknown as Request);
    }

    /**
     * Processes a request by wrapping the standard fetch method.
     */
    public override async processRequest(options: RequestOptions): Promise<ProcessResult> {
        let url = options.url || options.path || "/";
        if (!url.startsWith("http")) {
            const base = `http://${this.applicationConfig.hostname || "localhost"}:${this.applicationConfig.port || 3000}`;
            const path = url.startsWith("/") ? url : "/" + url;
            url = base + path;
        }

        if (options.query) {
            const u = new URL(url);
            for (const [k, v] of Object.entries(options.query)) {
                u.searchParams.set(k, v);
            }
            url = u.toString();
        }

        // Create Request to pass to fetch
        const req = new ConvectionRequest({
            method: (options.method || "GET") as Method,
            url,
            headers: options.headers as any,
            body: options.body && typeof options.body === "object" ? JSON.stringify(options.body) : options.body
        }) as unknown as ConvectionRequest<T>;

        const res = await this.fetch(req as unknown as Request);

        // Convert Response to ProcessResult
        const status = res.status;
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => headers[k] = v);

        let data: any;
        if (headers['content-type']?.includes('application/json')) {
            data = await res.json();
        } else {
            data = await res.text();
        }

        return {
            status,
            headers,
            data
        };
    }

    /**
     * Handles an incoming request (Bun.serve interface).
     * This logic contains the middleware chain and router dispatch.
     * 
     * @param req - The request to handle.
     * @returns The response to send.
     */
    public async fetch(req: Request): Promise<Response> {
        // Cast to ConvectionRequest if needed, though at runtime it's just a Request
        // But ConvectionContext expects ConvectionRequest.
        const request = req as unknown as ConvectionRequest<T>;

        const handle = async () => {
            const ctx = new ConvectionContext(request);
            const tracer = getTracer();

            return tracer.startActiveSpan(`${req.method} ${ctx.path}`, async (span) => {
                // Compose middleware + router dispatch
                const fn = compose(this.middleware);

                try {
                    // The "next" at the end of the middleware chain is the router dispatch
                    const result = await fn(ctx, async () => {
                        const match = this.find(req.method, ctx.path);
                        if (match) {
                            ctx.params = match.params;
                            return match.handler(ctx);
                        }
                        return null;
                    });

                    if (result instanceof Response) {
                        span.end();
                        return result;
                    }
                    if (result === null || result === undefined) {
                        span.setAttribute("http.status_code", 404);
                        span.end();
                        return ctx.text("Not Found", 404);
                    }
                    if (typeof result === "object") {
                        span.end();
                        return ctx.json(result);
                    }

                    span.end();
                    return ctx.text(String(result));

                }
                catch (err: any) {
                    console.error(err);
                    span.recordException(err);
                    span.setStatus({ code: 2 }); // Error
                    span.end();
                    return ctx.json({ error: "Internal Server Error", message: err.message }, 500);
                }
            });
        };

        if (this.applicationConfig.enableAsyncLocalStorage) {
            return asyncContext.run(new Map(), handle);
        }

        return handle();
    }
}
