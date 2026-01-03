import { Elysia } from "elysia";
import { COMPRESSIBLE_JSON, LARGE_JSON, md5, serializeRequest } from "../advanced-data";

export async function startAdvanced(port: number, scenario: string) {
    // Elysia is Bun-only - it doesn't work on Node.js
    if (typeof Bun === "undefined") {
        throw new Error("Elysia only supports Bun runtime");
    }

    const app = new Elysia();

    switch (scenario) {
        case "compression-gzip":
        case "compression-brotli":
        case "compression-deflate":
        case "compression-zstd":
            // Elysia doesn't have built-in compression middleware
            // Would need custom implementation
            throw new Error("Elysia doesn't have built-in compression support");

        case "compression-store":
            app.get("/compressed", () => COMPRESSIBLE_JSON);
            app.get("/compressed-large", () => LARGE_JSON);
            break;

        case "large-payload-request":
            app.post("/large-request", async ({ body }) => {
                const bodyLength = typeof body === 'string' ? body.length : Buffer.byteLength(JSON.stringify(body));
                return { received: bodyLength };
            });
            break;

        case "large-payload-response":
            app.get("/large-response", () => LARGE_JSON);
            break;

        case "large-payload-headers":
            app.get("/large-headers", ({ set }) => {
                for (let i = 0; i < 100; i++) {
                    set.headers[`X-Custom-Header-${i}`] = `Value-${i}-`.padEnd(200, 'x');
                }
                return "OK";
            });
            break;

        case "math-middleware":
            // Add 10 MD5 middleware
            for (let i = 0; i < 10; i++) {
                app.onRequest(({ request, set }) => {
                    const url = request.url;
                    const headersObj = Object.fromEntries(request.headers.entries());
                    // Body parsing in Elysia happens later, so we'll use empty string
                    const hash = md5(serializeRequest(url, JSON.stringify(headersObj), ""));
                    set.headers[`X-Hash-${i}`] = hash;
                });
            }
            app.get("/compute", () => "OK");
            break;

        case "scaling":
            // Register 1000 routes
            for (let i = 0; i < 1000; i++) {
                app.get(`/route-${i}`, () => `Route ${i}`);
            }
            break;

        case "fully-loaded":
            const { AsyncLocalStorage } = require('node:async_hooks');
            const als = new AsyncLocalStorage();

            app.onRequest(() => {
                als.enterWith(new Map([['requestId', Math.random().toString()]]));
            });

            app.onRequest(({ request, set }) => {
                if (request.method === "POST") {
                    // Validation would happen in route handler for Elysia
                }
            });

            app.post("/validate", ({ body, set }) => {
                if (!body || typeof (body as any).data !== 'string') {
                    set.status = 400;
                    return { error: "Invalid body" };
                }
                return { validated: true, data: body };
            });
            app.get("/validate", () => ({ validated: true }));
            break;

        case "long-pending":
            app.get("/delayed", async () => {
                await new Promise(r => setTimeout(r, 100));
                return "done";
            });
            break;

        default:
            throw new Error(`Unknown scenario: ${scenario}`);
    }

    app.listen(port);

    return async () => {
        app.stop();
    };
}
