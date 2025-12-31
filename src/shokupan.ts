import "./util/instrumentation";

import { context, trace } from '@opentelemetry/api';
import { ShokupanContext } from "./context";
import { compose } from "./middleware";
import { generateOpenApi } from "./plugins/openapi";
import { ShokupanRequest } from './request';
import { ShokupanRouter } from "./router";
import { $appRoot, $dispatch, $isApplication } from './symbol';
import type { Method, Middleware, ProcessResult, RequestOptions, ShokupanConfig, ShokupanHooks } from './types';
import { asyncContext } from "./util/async-hooks";


import { SystemCpuMonitor } from "./util/cpu-monitor";
import { getCallerInfo } from './util/stack';


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
    private composedMiddleware?: Middleware;
    private cpuMonitor?: SystemCpuMonitor;

    private hookCache = new Map<keyof ShokupanHooks, Function[]>();
    private hooksInitialized = false;

    get logger() {
        return this.applicationConfig.logger;
    }

    constructor(
        applicationConfig: ShokupanConfig = {}
    ) {
        const config = Object.assign({}, defaults, applicationConfig);
        // Exclude hooks from the router config passed to super() to avoid double execution
        // The application handles app-level hooks in handleRequest()
        const { hooks, ...routerConfig } = config;
        super(routerConfig);

        this[$isApplication] = true;
        this[$appRoot] = this;
        this.applicationConfig = config;

        // Capture metadata for the application instance
        const { file, line } = getCallerInfo();
        this.metadata = {
            file,
            line,
            name: 'ShokupanApplication'
        };
    }

    /**
     * Adds middleware to the application.
     */
    public use(middleware: Middleware) {
        let trackedMiddleware = middleware;

        // --- Middleware Tracking Logic ---
        const { file, line } = getCallerInfo();

        // Store metadata on the original middleware function if possible
        if (!(middleware as any).metadata) {
            (middleware as any).metadata = {
                file,
                line,
                name: middleware.name || 'middleware',
                isBuiltin: (middleware as any).isBuiltin,
                pluginName: (middleware as any).pluginName
            };
        }

        // Create wrapper but preserve metadata for registry
        trackedMiddleware = async (ctx, next) => {
            // Cast to any to access handlerStack if types are strict, but ShokupanContext should have it.
            const c = ctx as any;
            if (c.handlerStack && c.app?.applicationConfig.enableMiddlewareTracking) {
                const metadata = (middleware as any).metadata || {};
                c.handlerStack.push({
                    name: metadata.pluginName ? `${metadata.pluginName} (${metadata.name})` : metadata.name || middleware.name || 'middleware',
                    file: metadata.file || file,
                    line: metadata.line || line,
                    isBuiltin: metadata.isBuiltin
                });
            }
            return middleware(ctx, next);
        };
        (trackedMiddleware as any).metadata = (middleware as any).metadata;
        Object.defineProperty(trackedMiddleware, 'name', { value: (middleware as any).name || 'middleware' });

        (trackedMiddleware as any).order = this.middleware.length;
        this.middleware.push(trackedMiddleware);
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

    private specAvailableHooks: ((spec: any) => void | Promise<void>)[] = [];

    /**
     * Registers a callback to be executed when the OpenAPI spec is available.
     * This happens after generateOpenApi() but before the server starts listening (or at least before it finishes startup if async).
     */
    public onSpecAvailable(callback: (spec: any) => void | Promise<void>) {
        this.specAvailableHooks.push(callback);
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
            // Run spec available hooks
            for (const hook of this.specAvailableHooks) {
                await hook(this.openApiSpec);
            }
        }

        if (port === 0 && process.platform === "linux") {

        }


        if (this.applicationConfig.autoBackpressureFeedback) {
            this.cpuMonitor = new SystemCpuMonitor();
            this.cpuMonitor.start();
        }

        const serveOptions = {

            port: finalPort,
            hostname: this.applicationConfig.hostname,
            development: this.applicationConfig.development,
            fetch: this.fetch.bind(this),
            reusePort: this.applicationConfig.reusePort,
            idleTimeout: this.applicationConfig.readTimeout ? this.applicationConfig.readTimeout / 1000 : undefined,
            websocket: {
                open(ws) {
                    ws.data?.handler?.open?.(ws);
                },
                message(ws, message) {
                    ws.data?.handler?.message?.(ws, message);
                },
                drain(ws) {
                    ws.data?.handler?.drain?.(ws);
                },
                close(ws, code, reason) {
                    ws.data?.handler?.close?.(ws, code, reason);
                },
            }
        };



        let factory = this.applicationConfig.serverFactory;

        // Detect if we are not running on Bun
        // @ts-ignore
        if (!factory && typeof Bun === "undefined") {
            const { createHttpServer } = await import("./plugins/server-adapter");
            factory = createHttpServer();
        }

        const server = factory
            ? await factory(serveOptions)
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
    public async fetch(req: Request, server?: import("bun").Server<any>): Promise<Response> {
        if (this.applicationConfig.enableTracing) {
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

                return asyncContext.run(ctxMap, () => this.handleRequest(req, server).finally(() => span.end()));
            });
        }

        // If ALS is enabled but tracing is not
        if (this.applicationConfig.enableAsyncLocalStorage) {
            const ctxMap = new Map();
            ctxMap.set("request", req);
            return asyncContext.run(ctxMap, () => this.handleRequest(req, server));
        }

        return this.handleRequest(req, server);
    }

    private async handleRequest(req: Request, server?: import("bun").Server<any>): Promise<Response> {
        // Cast to ShokupanRequest if needed, though at runtime it's just a Request
        // But ShokupanContext expects ShokupanRequest.
        const request = req as unknown as ShokupanRequest<T>;

        const ctx = new ShokupanContext<T>(request, server, undefined, this, this.applicationConfig.enableMiddlewareTracking);

        const handle = async () => {

            // Auto-Backpressure Check
            if (this.cpuMonitor && this.cpuMonitor.getUsage() > (this.applicationConfig.autoBackpressureLevel ?? 60)) {
                // Return 429 immediately
                const msg = "Too Many Requests (CPU Backpressure)";
                const res = ctx.text(msg, 429);
                // Trigger hooks so metrics are recorded
                await this.executeHook('onResponseEnd', ctx, res);
                return res;
            }

            try {
                // Request Start Hook
                if (this.hasHook('onRequestStart')) {
                    await this.executeHook('onRequestStart', ctx);
                }

                // Compose middleware + router dispatch
                const fn = this.composedMiddleware ??= compose(this.middleware);

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
                else if ((result === null || result === undefined) && ctx.response.status === 404) {
                    // If status is 404 (default) and no result, try to see if it was modified?
                    // Actually ShokupanContext sets default status 200? No context.response wraps a base response?
                    // Wait, context has internal response object.

                    // If simply nothing was returned and status wasn't set to something else, assume 404 Not Found
                    // But if user set status 200 manually?

                    // Simple logic:
                    const span = asyncContext.getStore()?.get("span");
                    if (span) span.setAttribute("http.status_code", 404);
                    response = ctx.text("Not Found", 404);
                }
                else if (result === null || result === undefined) {
                    // Fallback to whatever is in ctx
                    // Or if ctx has a body set?
                    // For now default not found logic above covers most "no match" cases.
                    // But if match found and handler returned null?
                    if (ctx._finalResponse) response = ctx._finalResponse;
                    else response = ctx.text("Not Found", 404);
                }
                else if (typeof result === "object") {
                    response = ctx.json(result);
                }
                else {
                    response = ctx.text(String(result));
                }

                // Request End Hook - Processing finished, response ready
                if (this.hasHook('onRequestEnd')) {
                    await this.executeHook('onRequestEnd', ctx);
                }

                // Response Start Hook - About to send response
                if (this.hasHook('onResponseStart')) {
                    await this.executeHook('onResponseStart', ctx, response);
                }

                return response;

            }
            catch (err: any) {
                console.error(err);
                const span = asyncContext.getStore()?.get("span");
                if (span) span.setStatus({ code: 2 }); // Error

                const status = err.status || err.statusCode || 500;
                const body: any = { error: err.message || "Internal Server Error" };
                if (err.errors) body.errors = err.errors;

                // Error Hook
                if (this.hasHook('onError')) {
                    await this.executeHook('onError', err, ctx);
                }

                return ctx.json(body, status);
            }
        };

        // Timeout Logic
        let executionPromise = handle();
        const timeoutMs = this.applicationConfig.requestTimeout;

        if (timeoutMs && timeoutMs > 0 && this.hasHook('onRequestTimeout')) {
            let timeoutId: any;
            const timeoutPromise = new Promise<Response>((_, reject) => {
                timeoutId = setTimeout(async () => {
                    await this.executeHook('onRequestTimeout', ctx);

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
                if (this.hasHook('onResponseEnd')) {
                    await this.executeHook('onResponseEnd', ctx, res);
                }
                return res;
            });
    }

    private ensureHooksInitialized() {

        const hooks = this.applicationConfig.hooks;
        if (hooks) {
            const hookList = Array.isArray(hooks) ? hooks : [hooks];

            // Pre-compute lookup for each hook type
            const hookTypes: (keyof ShokupanHooks)[] = [
                'onRequestStart', 'onRequestEnd',
                'onResponseStart', 'onResponseEnd',
                'onError',
                'beforeValidate', 'afterValidate',
                'onRequestTimeout', 'onReadTimeout', 'onWriteTimeout'
            ];

            for (const type of hookTypes) {
                const fns: Function[] = [];
                for (const h of hookList) {
                    if (h[type]) fns.push(h[type]!);
                }
                if (fns.length > 0) {
                    this.hookCache.set(type, fns);
                }
            }
        }
        this.hooksInitialized = true;
    }

    private async executeHook(name: keyof ShokupanHooks, ...args: any[]) {
        // Optimization: Use hasHook check before calling this usually
        // But we ensure initialized here too just in case
        if (!this.hooksInitialized) {
            this.ensureHooksInitialized();
        }
        const fns = this.hookCache.get(name);
        if (!fns) return;

        for (const fn of fns) {
            // @ts-ignore
            await fn(...args);
        }
    }

    private hasHook(name: keyof ShokupanHooks) {
        if (!this.hooksInitialized) {
            this.ensureHooksInitialized();
        }
        return this.hookCache.has(name);
    }
}
