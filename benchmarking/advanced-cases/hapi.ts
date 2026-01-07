import Hapi from "@hapi/hapi";
import { COMPRESSIBLE_JSON, LARGE_JSON, SMALL_JSON, md5, serializeRequest } from "../advanced-data";

export async function startAdvanced(port: number, scenario: string) {
    const server = Hapi.server({
        port,
        host: '0.0.0.0'
    });

    switch (scenario) {
        case "compression-gzip":
        case "compression-deflate":
            // Hapi has built-in compression
            server.route({
                method: 'GET',
                path: '/compressed',
                handler: () => COMPRESSIBLE_JSON,
                options: {
                    compression: { /* uses gzip by default */ }
                }
            });
            server.route({
                method: 'GET',
                path: '/compressed-large',
                handler: () => LARGE_JSON,
                options: {
                    compression: {}
                }
            });
            break;

        case "compression-brotli":
        case "compression-zstd":
            throw new Error("Hapi doesn't support brotli/zstd compression by default");

        case "compression-store":
            server.route({
                method: 'GET',
                path: '/compressed',
                handler: () => COMPRESSIBLE_JSON
            });
            server.route({
                method: 'GET',
                path: '/compressed-large',
                handler: () => LARGE_JSON
            });
            break;

        case "large-payload-request":
            server.route({
                method: 'POST',
                path: '/large-request',
                options: {
                    payload: {
                        maxBytes: 50 * 1024 * 1024,
                        parse: true,
                        allow: 'text/plain'
                    }
                },
                handler: (request) => {
                    const bodyLength = typeof request.payload === 'string' ? request.payload.length : Buffer.byteLength(request.payload || '');
                    return { received: bodyLength };
                }
            });
            break;

        case "large-payload-response":
            server.route({
                method: 'GET',
                path: '/large-response',
                handler: () => LARGE_JSON
            });
            break;

        case "large-payload-headers":
            server.route({
                method: 'GET',
                path: '/large-headers',
                handler: (request, h) => {
                    const response = h.response("OK");
                    for (let i = 0; i < 100; i++) {
                        response.header(`X-Custom-Header-${i}`, `Value-${i}-`.padEnd(200, 'x'));
                    }
                    return response;
                }
            });
            break;

        case "math-middleware":
            // Add 10 MD5 middleware
            for (let i = 0; i < 10; i++) {
                server.ext('onRequest', (request, h) => {
                    const url = request.url.toString();
                    const headersObj = request.headers as Record<string, string>;
                    const body = JSON.stringify(request.payload || "");
                    const hash = md5(serializeRequest(url, JSON.stringify(headersObj), body));
                    request.headers[`x-hash-${i}`] = hash;
                    return h.continue;
                });
            }
            server.route({
                method: 'GET',
                path: '/compute',
                handler: () => "OK"
            });
            break;

        case "scaling":
            // Register 1000 routes
            for (let i = 0; i < 1000; i++) {
                server.route({
                    method: 'GET',
                    path: `/route-${i}`,
                    handler: () => `Route ${i}`
                });
            }
            break;

        case "fully-loaded":
            const { AsyncLocalStorage } = require('node:async_hooks');
            const als = new AsyncLocalStorage();

            server.ext('onRequest', (request, h) => {
                als.enterWith(new Map([['requestId', Math.random().toString()]]));
                return h.continue;
            });

            server.ext('onPreHandler', (request, h) => {
                if (request.method === 'post') {
                    const body = request.payload as any;
                    if (!body || typeof body.data !== 'string') {
                        return h.response({ error: "Invalid body" }).code(400).takeover();
                    }
                }
                return h.continue;
            });

            server.route({
                method: 'POST',
                path: '/validate',
                handler: (request) => {
                    return { validated: true, data: request.payload };
                }
            });
            server.route({
                method: 'GET',
                path: '/validate',
                handler: () => {
                    return { validated: true };
                }
            });
            break;

        case "long-pending":
            server.route({
                method: 'GET',
                path: '/delayed',
                handler: async () => {
                    await new Promise(r => setTimeout(r, 100));
                    return "done";
                }
            });
            break;

        // Property access test
        case "property-access":
            server.route({
                method: 'GET',
                path: '/property/path',
                handler: (request) => {
                    return request.path;
                }
            });
            break;

        // Multi-process tests
        case "multi-process":
            server.route({
                method: 'GET',
                path: '/small-get',
                handler: () => SMALL_JSON
            });

            server.route({
                method: 'GET',
                path: '/large-get',
                handler: () => LARGE_JSON
            });

            server.route({
                method: 'POST',
                path: '/large-post',
                handler: (request) => {
                    const bodyLength = typeof request.payload === 'string' ? request.payload.length : 0;
                    return { received: bodyLength };
                }
            });
            break;

        default:
            throw new Error(`Unknown scenario: ${scenario}`);
    }

    await server.start();

    return async () => {
        await server.stop();
    };
}
