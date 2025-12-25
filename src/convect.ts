
import { ConvectionContext } from "./context";
import { compose } from "./middleware";
import { ConvectionRouter } from "./router";
import { $appRoot, $isApplication } from './symbol';
import { asyncContext, getTracer } from "./telemetry";
import type { ConvectionConfig, Middleware } from './types';

const defaults: ConvectionConfig = {
    port: 3000,
    hostname: "localhost",
    development: process.env.NODE_ENV !== "production",
};

export class Convection extends ConvectionRouter {
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
            fetch: this.handleRequest.bind(this),
        });

        console.log(`Convect server listening on http://${server.hostname}:${server.port}`);
        return server;
    }

    /**
     * Handles an incoming request.
     * 
     * @param req - The request to handle.
     * @returns The response to send.
     */
    private async handleRequest(req: Request): Promise<Response> {
        return asyncContext.run(new Map(), async () => {
            const ctx = new ConvectionContext(req);
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
        });
    }
}
