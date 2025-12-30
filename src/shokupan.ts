import "./util/instrumentation";

import { context, trace } from '@opentelemetry/api';
import { ShokupanContext } from "./context";
import { compose } from "./middleware";
import { generateOpenApi } from "./plugins/openapi";
import { ShokupanRequest } from './request';
import { ShokupanRouter } from "./router";
import { $appRoot, $dispatch, $isApplication } from './symbol';
import type { Method, Middleware, ProcessResult, RequestOptions, ShokupanConfig } from './types';
import { asyncContext } from "./util/async-hooks";

const defaults: ShokupanConfig = {
    port: 3000,
    hostname: "localhost",
    development: process.env.NODE_ENV !== "production",
    enableAsyncLocalStorage: false,
    reusePort: false,
};
const tracer = trace.getTracer("shokupan.application");


export class Shokupan<T = any> extends ShokupanRouter<T> {
    readonly applicationConfig: ShokupanConfig = {};
    public openApiSpec?: any;
    private middleware: Middleware[] = [];

    get logger() {
        return this.applicationConfig.logger;
    }

    constructor(
        applicationConfig: ShokupanConfig = {}
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
        return this;
    }

    private startupHooks: (() => Promise<void> | void)[] = [];

    /**
     * Registers a callback to be executed before the server starts listening.
     */
    public onStart(callback: () => Promise<void> | void) {
        this.startupHooks.push(callback);
        return this;
    }

    /**
     * Starts the application server.
     * 
     * @param port - The port to listen on. If not specified, the port from the configuration is used. If that is not specified, port 3000 is used.
     * @returns The server instance.
     */
    public async listen(port?: number) {
        const finalPort = port ?? this.applicationConfig.port ?? 3000;

        if (finalPort < 0 || finalPort > 65535) {
            throw new Error("Invalid port number");
        }

        // Run startup hooks
        for (const hook of this.startupHooks) {
            await hook();
        }

        if (this.applicationConfig.enableOpenApiGen) {
            this.openApiSpec = await generateOpenApi(this);
        }

        if (port === 0 && process.platform === "linux") {

        }

        const serveOptions = {
            port: finalPort,
            hostname: this.applicationConfig.hostname,
            development: this.applicationConfig.development,
            fetch: this.fetch.bind(this),
            reusePort: this.applicationConfig.reusePort,
            idleTimeout: this.applicationConfig.readTimeout ? this.applicationConfig.readTimeout / 1000 : undefined,
        };

        const server = this.applicationConfig.serverFactory
            ? await this.applicationConfig.serverFactory(serveOptions)
            : Bun.serve(serveOptions);

        console.log(`Shokupan server listening on http://${server.hostname}:${server.port}`);
        return server;
    }

    public [$dispatch](req: ShokupanRequest<T>) {
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
        const req = new ShokupanRequest({
            method: (options.method || "GET") as Method,
            url,
            headers: options.headers as any,
            body: options.body && typeof options.body === "object" ? JSON.stringify(options.body) : options.body
        }) as unknown as ShokupanRequest<T>;

        const res = await this.fetch(req as unknown as Request);

        // Convert Response to ProcessResult
        const status = res.status;
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => headers[k] = v);

        let data: any;
        if (headers['content-type']?.includes('application/json')) {
            data = await res.json();
        }
        else {
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
     * @param server - The server instance.
     * @returns The response to send.
     */
    public async fetch(req: Request, server?: import("bun").Server): Promise<Response> {
        const tracer = trace.getTracer("shokupan.application");
        const store = asyncContext.getStore();

        const attrs = {
            attributes: {
                "http.url": req.url,
                "http.method": req.method
            }
        };

        const parent = store?.get("span");
        const ctx = parent ? trace.setSpan(context.active(), parent) : undefined;
        return tracer.startActiveSpan(`${req.method} ${new URL(req.url).pathname}`, attrs, ctx, span => {
            const ctxMap = new Map();
            ctxMap.set("span", span);
            ctxMap.set("request", req);

            const runCallback = () => {
                // Cast to ShokupanRequest if needed, though at runtime it's just a Request
                // But ShokupanContext expects ShokupanRequest.
                const request = req as unknown as ShokupanRequest<T>;

                const ctx = new ShokupanContext<T>(request, server, undefined, this);

                const handle = async () => {

                    try {
                        // Request Start Hook
                        if (this.applicationConfig.hooks?.onRequestStart) {
                            await this.applicationConfig.hooks.onRequestStart(ctx);
                        }

                        // Compose middleware + router dispatch
                        const fn = compose(this.middleware);
                        // Object.defineProperty(fn, 'name', { value: "middleware chain", configurable: false });

                        // The "next" at the end of the middleware chain is the router dispatch
                        const result = await fn(ctx, async () => {
                            const match = this.find(req.method, ctx.path);
                            // TODO: Execute router-level hooks from match?
                            // For now, only app-level hooks are fully supported here.
                            if (match) {
                                ctx.params = match.params;
                                return match.handler(ctx);
                            }
                            return null;
                        });

                        let response: Response;
                        if (result instanceof Response) {
                            response = result;
                        }
                        // Check explicit void return but response set in context
                        else if ((result === null || result === undefined) && ctx._finalResponse instanceof Response) {
                            response = ctx._finalResponse;
                        }
                        else if (result === null || result === undefined) {
                            span.setAttribute("http.status_code", 404);
                            response = ctx.text("Not Found", 404);
                        }
                        else if (typeof result === "object") {
                            response = ctx.json(result);
                        }
                        else {
                            response = ctx.text(String(result));
                        }

                        // Request End Hook - Processing finished, response ready
                        if (this.applicationConfig.hooks?.onRequestEnd) {
                            await this.applicationConfig.hooks.onRequestEnd(ctx);
                        }

                        // Response Start Hook - About to send response
                        if (this.applicationConfig.hooks?.onResponseStart) {
                            await this.applicationConfig.hooks.onResponseStart(ctx, response);
                        }

                        return response;

                    }
                    catch (err: any) {
                        console.error(err);
                        span.setStatus({ code: 2 }); // Error
                        const status = err.status || err.statusCode || 500;
                        const body: any = { error: err.message || "Internal Server Error" };
                        if (err.errors) body.errors = err.errors;

                        // Error Hook
                        if (this.applicationConfig.hooks?.onError) {
                            try {
                                await this.applicationConfig.hooks.onError(err, ctx as any);
                            } catch (hookErr) {
                                console.error("Error in onError hook:", hookErr);
                            }
                        }

                        return ctx.json(body, status);
                    }
                };

                // Timeout Logic
                let executionPromise = handle();
                const timeoutMs = this.applicationConfig.requestTimeout;

                if (timeoutMs && timeoutMs > 0 && this.applicationConfig.hooks?.onRequestTimeout) {
                    let timeoutId: any;
                    const timeoutPromise = new Promise<Response>((_, reject) => {
                        timeoutId = setTimeout(async () => {
                            try {
                                if (this.applicationConfig.hooks?.onRequestTimeout) {
                                    await this.applicationConfig.hooks.onRequestTimeout(ctx);
                                }
                            } catch (e) { console.error("Error in onRequestTimeout hook:", e); }

                            reject(new Error("Request Timeout"));
                        }, timeoutMs);
                    });

                    executionPromise = Promise.race([executionPromise, timeoutPromise])
                        .finally(() => clearTimeout(timeoutId));
                }

                return executionPromise
                    .catch((err) => {
                        if (err.message === "Request Timeout") {
                            return ctx.text("Request Timeout", 408);
                        }
                        console.error("Unexpected error in request execution:", err);
                        return ctx.text("Internal Server Error", 500);
                    })
                    .then(async (res) => {
                        // Response End Hook - Response returned
                        // Note: We can't guarantee it's fully sent to client here, but it's handed off to Bun
                        if (this.applicationConfig.hooks?.onResponseEnd) {
                            await this.applicationConfig.hooks.onResponseEnd(ctx as any, res);
                        }
                        return res;
                    })
                    .finally(() => span.end());
            };

            if (this.applicationConfig.enableAsyncLocalStorage) {
                return asyncContext.run(ctxMap, runCallback);
            }
            else {
                return runCallback();
            }
        });
    }
}
