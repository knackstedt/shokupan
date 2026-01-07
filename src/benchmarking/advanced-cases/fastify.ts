import fastify from "fastify";
import { COMPRESSIBLE_JSON, LARGE_JSON, SMALL_JSON, md5, serializeRequest } from "../advanced-data";

export async function startAdvanced(port: number, scenario: string) {
    const app = fastify({ logger: false });

    switch (scenario) {
        case "compression-gzip":
        case "compression-brotli":
        case "compression-deflate":
            // Fastify has built-in compression support
            await app.register(require('@fastify/compress'));
            app.get("/compressed", async (request, reply) => {
                return COMPRESSIBLE_JSON;
            });
            app.get("/compressed-large", async (request, reply) => {
                return LARGE_JSON;
            });
            break;

        case "compression-zstd":
            // Fastify doesn't support zstd out of the box, skip
            throw new Error("Fastify does not support zstd compression");

        case "compression-store":
            app.get("/compressed", async (request, reply) => {
                return COMPRESSIBLE_JSON;
            });
            app.get("/compressed-large", async (request, reply) => {
                return LARGE_JSON;
            });
            break;

        case "large-payload-request":
            app.addContentTypeParser('text/plain', { parseAs: 'string', bodyLimit: 15 * 1024 * 1024 }, async (req, body) => {
                return body;
            });
            app.post("/large-request", async (request, reply) => {
                const bodyLength = typeof request.body === 'string' ? request.body.length : Buffer.byteLength(request.body || '');
                return { received: bodyLength };
            });
            break;

        case "large-payload-response":
            app.get("/large-response", async (request, reply) => {
                return LARGE_JSON;
            });
            break;

        case "large-payload-headers":
            app.get("/large-headers", async (request, reply) => {
                for (let i = 0; i < 100; i++) {
                    reply.header(`X-Custom-Header-${i}`, `Value-${i}-`.padEnd(200, 'x'));
                }
                return "OK";
            });
            break;

        case "math-middleware":
            // Add 10 MD5 middleware
            for (let i = 0; i < 10; i++) {
                app.addHook('onRequest', async (request, reply) => {
                    const url = request.url;
                    const headers = JSON.stringify(request.headers);
                    const body = JSON.stringify(request.body || "");
                    const hash = md5(serializeRequest(url, headers, body));
                    reply.header(`X-Hash-${i}`, hash);
                });
            }
            app.get("/compute", async (request, reply) => {
                return "OK";
            });
            break;

        case "scaling":
            // Register 1000 routes
            for (let i = 0; i < 1000; i++) {
                app.get(`/route-${i}`, async (request, reply) => {
                    return `Route ${i}`;
                });
            }
            break;

        case "fully-loaded":
            // AsyncLocalStorage
            const { AsyncLocalStorage } = require('node:async_hooks');
            const als = new AsyncLocalStorage();

            app.addHook('onRequest', async (request, reply) => {
                als.run(new Map([['requestId', Math.random().toString()]]), () => { });
            });

            // Validator
            app.addHook('preHandler', async (request, reply) => {
                if (request.method === "POST") {
                    const body = request.body as any;
                    if (!body || typeof body.data !== 'string') {
                        reply.status(400).send({ error: "Invalid body" });
                    }
                }
            });

            app.post("/validate", async (request, reply) => {
                return { validated: true, data: request.body };
            });
            app.get("/validate", async (request, reply) => {
                return { validated: true };
            });
            break;

        case "long-pending":
            app.get("/delayed", async (request, reply) => {
                await new Promise(r => setTimeout(r, 100));
                return "done";
            });
            break;

        // Property access test
        case "property-access":
            app.get("/property/path", async (request, reply) => {
                return request.url;
            });
            break;

        // Multi-process tests
        case "multi-process":
            app.get("/small-get", async (request, reply) => {
                return SMALL_JSON;
            });

            app.get("/large-get", async (request, reply) => {
                return LARGE_JSON;
            });

            app.post("/large-post", async (request, reply) => {
                const bodyLength = typeof request.body === 'string' ? request.body.length : 0;
                return { received: bodyLength };
            });
            break;

        default:
            throw new Error(`Unknown scenario: ${scenario}`);
    }

    await app.listen({ port, host: '0.0.0.0' });

    return async () => {
        await app.close();
    };
}
