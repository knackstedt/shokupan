import { Hono } from "hono";
import { compress } from 'hono/compress';
import { COMPRESSIBLE_JSON, LARGE_JSON, md5, serializeRequest } from "../advanced-data";

export async function startAdvanced(port: number, scenario: string) {
    const app = new Hono();

    switch (scenario) {
        case "compression-gzip":
            app.use('/compressed*', compress({ encoding: 'gzip' }));
            app.get("/compressed", (c) => c.json(COMPRESSIBLE_JSON));
            app.get("/compressed-large", (c) => c.json(LARGE_JSON));
            break;

        case "compression-deflate":
            app.use('/compressed*', compress({ encoding: 'deflate' }));
            app.get("/compressed", (c) => c.json(COMPRESSIBLE_JSON));
            app.get("/compressed-large", (c) => c.json(LARGE_JSON));
            break;

        case "compression-brotli":
        case "compression-zstd":
            // Hono doesn't support brotli/zstd
            throw new Error("Hono doesn't support brotli/zstd compression");

        case "compression-store":
            app.get("/compressed", (c) => c.json(COMPRESSIBLE_JSON));
            app.get("/compressed-large", (c) => c.json(LARGE_JSON));
            break;

        case "large-payload-request":
            app.post("/large-request", async (c) => {
                const body = await c.req.text();
                return c.json({ received: body.length });
            });
            break;

        case "large-payload-response":
            app.get("/large-response", (c) => c.json(LARGE_JSON));
            break;

        case "large-payload-headers":
            app.get("/large-headers", (c) => {
                for (let i = 0; i < 100; i++) {
                    c.header(`X-Custom-Header-${i}`, `Value-${i}-`.padEnd(200, 'x'));
                }
                return c.text("OK");
            });
            break;

        case "math-middleware":
            // Add 10 MD5 middleware
            for (let i = 0; i < 10; i++) {
                app.use(async (c, next) => {
                    const url = c.req.url;
                    const headers = JSON.stringify(Object.fromEntries(c.req.raw.headers.entries()));
                    const body = await c.req.raw.clone().text().catch(() => "");
                    const hash = md5(serializeRequest(url, headers, body));
                    c.header(`X-Hash-${i}`, hash);
                    await next();
                });
            }
            app.get("/compute", (c) => c.text("OK"));
            break;

        case "scaling":
            // Register 1000 routes
            for (let i = 0; i < 1000; i++) {
                app.get(`/route-${i}`, (c) => c.text(`Route ${i}`));
            }
            break;

        case "fully-loaded":
            const { AsyncLocalStorage } = require('node:async_hooks');
            const als = new AsyncLocalStorage();

            app.use(async (c, next) => {
                await als.run(new Map([['requestId', Math.random().toString()]]), next);
            });

            app.use(async (c, next) => {
                if (c.req.method === "POST") {
                    const body = await c.req.json().catch(() => null);
                    if (!body || typeof body.data !== 'string') {
                        return c.json({ error: "Invalid body" }, 400);
                    }
                }
                await next();
            });

            app.post("/validate", async (c) => {
                const body = await c.req.json();
                return c.json({ validated: true, data: body });
            });
            app.get("/validate", (c) => c.json({ validated: true }));
            break;

        case "long-pending":
            app.get("/delayed", async (c) => {
                await new Promise(r => setTimeout(r, 100));
                return c.text("done");
            });
            break;

        default:
            throw new Error(`Unknown scenario: ${scenario}`);
    }

    const server = Bun.serve({
        port,
        fetch: app.fetch
    });

    return async () => {
        server.stop();
    };
}
