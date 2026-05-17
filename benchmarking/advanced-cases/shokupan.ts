import { Compression } from "../../src/plugins/middleware/compression";
import { Shokupan } from "../../src/shokupan";
import type { Middleware, NextFn } from "../../src/util/types";
import { COMPRESSIBLE_JSON, LARGE_JSON, SMALL_JSON, md5, serializeRequest } from "../advanced-data";

export async function startAdvanced(port: number, scenario: string) {
    const app = new Shokupan({
        port,
        hostname: "127.0.0.1",
        enableOpenApiGen: false,
        enableAsyncApiGen: false,
        development: false,
        logger: {
            verbose: false,
            info: () => { },
            debug: () => { },
            warning: () => { },
            error: () => { },
            fatal: () => { }
        } as any,
        enableAsyncLocalStorage: scenario === "fully-loaded",
        reusePort: !!process.env.REUSE_PORT,
        // Disable automatic body pre-parsing for large payload scenarios to avoid overhead
        disableBodyParsing: scenario === "large-payload-request" || scenario === "fully-loaded"
    });

    switch (scenario) {
        case "compression-gzip":
        case "compression-brotli":
        case "compression-zstd":
        case "compression-deflate":
            // Use compression middleware
            app.use(Compression({ threshold: 1024 }));
            app.get("/compressed", (ctx) => {
                return ctx.json(COMPRESSIBLE_JSON);
            });
            app.get("/compressed-large", (ctx) => {
                return ctx.json(LARGE_JSON);
            });
            break;

        case "compression-store":
            // No compression, just return data
            app.get("/compressed", (ctx) => {
                return ctx.json(COMPRESSIBLE_JSON);
            });
            app.get("/compressed-large", (ctx) => {
                return ctx.json(LARGE_JSON);
            });
            break;

        case "large-payload-request":
            app.post("/large-request", async (ctx) => {
                const body = await ctx.body<string>(); // Use cached pre-parsed body
                return ctx.json({ received: body.length });
            });
            break;

        case "large-payload-response":
            app.get("/large-response", (ctx) => {
                return ctx.json(LARGE_JSON);
            });
            break;

        case "large-payload-headers":
            app.get("/large-headers", (ctx) => {
                // Add 100 large headers to response
                const headers = new Headers();
                for (let i = 0; i < 100; i++) {
                    headers.set(`X-Custom-Header-${i}`, `Value-${i}-`.padEnd(200, 'x'));
                }
                return new Response("OK", { headers });
            });
            break;

        case "math-middleware":
            // Add 10 MD5 middleware
            for (let i = 0; i < 10; i++) {
                const hashMiddleware: Middleware = async (ctx, next: NextFn) => {
                    const url = ctx.url.toString();
                    const headersObj = Object.fromEntries(ctx.headers.entries());
                    // Skip body reading for GET requests (no body to read)
                    const hash = md5(serializeRequest(url, JSON.stringify(headersObj), ""));
                    ctx.set(`X-Hash-${i}`, hash);
                    return next();
                };
                app.use(hashMiddleware);
            }
            app.get("/compute", (ctx) => {
                return ctx.text("OK");
            });
            break;

        case "scaling":
            // Register 1000 routes
            for (let i = 0; i < 1000; i++) {
                app.get(`/route-${i}`, (ctx) => {
                    return ctx.text(`Route ${i}`);
                });
            }
            break;

        case "fully-loaded":
            // Simple validator middleware (simulating Zod)
            const validatorMiddleware: Middleware = async (ctx, next: NextFn) => {
                if (ctx.request.method === "POST") {
                    const body = await ctx.body() as any;
                    if (!body || typeof body.data !== 'string') {
                        return ctx.json({ error: "Invalid body" }, 400);
                    }
                }
                return next();
            };
            app.use(validatorMiddleware);

            app.post("/validate", async (ctx) => {
                const body = await ctx.body();
                return ctx.json({ validated: true, data: body });
            });
            app.get("/validate", (ctx) => {
                return ctx.json({ validated: true });
            });
            break;

        case "long-pending":
            app.get("/delayed", async (ctx) => {
                // 100ms delay to test concurrent handling
                await new Promise(r => setTimeout(r, 100));
                return ctx.text("done");
            });
            break;

        // Property access test
        case "property-access":
            app.get("/property/path", (ctx) => {
                const value = ctx.path;
                return ctx.text(value);
            });
            break;

        // Multi-process tests
        case "multi-process":
            // Small GET endpoint with small response
            app.get("/small-get", (ctx) => {
                return ctx.json(SMALL_JSON);
            });

            // Large GET endpoint with large response
            app.get("/large-get", (ctx) => {
                return ctx.json(LARGE_JSON);
            });

            // POST endpoint with large payload
            app.post("/large-post", async (ctx) => {
                const body = await ctx.body<string>();
                return ctx.json({ received: body?.length || 0 });
            });
            break;

        default:
            throw new Error(`Unknown scenario: ${scenario}`);
    }

    const server = await app.listen(port);

    return async () => {
        server.stop();
    };
}
