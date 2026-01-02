import Router from "@koa/router";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import { COMPRESSIBLE_JSON, LARGE_JSON, md5, serializeRequest } from "../advanced-data";

export async function startAdvanced(port: number, scenario: string) {
    const app = new Koa();
    const router = new Router();
    app.use(bodyParser({ jsonLimit: '50mb' }));

    switch (scenario) {
        case "compression-gzip":
        case "compression-deflate":
            const compress = require('koa-compress');
            app.use(compress());
            router.get("/compressed", (ctx) => {
                ctx.body = COMPRESSIBLE_JSON;
            });
            router.get("/compressed-large", (ctx) => {
                ctx.body = LARGE_JSON;
            });
            break;

        case "compression-brotli":
        case "compression-zstd":
            throw new Error("Koa compress doesn't support brotli/zstd by default");

        case "compression-store":
            router.get("/compressed", (ctx) => {
                ctx.body = COMPRESSIBLE_JSON;
            });
            router.get("/compressed-large", (ctx) => {
                ctx.body = LARGE_JSON;
            });
            break;

        case "large-payload-request":
            // Manually handle text/plain bodies instead of using bodyparser
            router.post("/large-request", async (ctx) => {
                const chunks: Buffer[] = [];
                for await (const chunk of ctx.req) {
                    chunks.push(chunk);
                }
                const body = Buffer.concat(chunks).toString('utf-8');
                ctx.body = { received: body.length };
            });
            break;

        case "large-payload-response":
            router.get("/large-response", (ctx) => {
                ctx.body = LARGE_JSON;
            });
            break;

        case "large-payload-headers":
            router.get("/large-headers", (ctx) => {
                for (let i = 0; i < 100; i++) {
                    ctx.set(`X-Custom-Header-${i}`, `Value-${i}-`.padEnd(200, 'x'));
                }
                ctx.body = "OK";
            });
            break;

        case "math-middleware":
            // Add 10 MD5 middleware
            for (let i = 0; i < 10; i++) {
                app.use(async (ctx, next) => {
                    const url = ctx.url;
                    const headers = JSON.stringify(ctx.headers);
                    const body = JSON.stringify(ctx.request.body || "");
                    const hash = md5(serializeRequest(url, headers, body));
                    ctx.set(`X-Hash-${i}`, hash);
                    await next();
                });
            }
            router.get("/compute", (ctx) => {
                ctx.body = "OK";
            });
            break;

        case "scaling":
            // Register 1000 routes
            for (let i = 0; i < 1000; i++) {
                router.get(`/route-${i}`, (ctx) => {
                    ctx.body = `Route ${i}`;
                });
            }
            break;

        case "fully-loaded":
            const { AsyncLocalStorage } = require('node:async_hooks');
            const als = new AsyncLocalStorage();

            app.use(async (ctx, next) => {
                await als.run(new Map([['requestId', Math.random().toString()]]), next);
            });

            app.use(async (ctx, next) => {
                if (ctx.method === "POST") {
                    const body = ctx.request.body as any;
                    if (!body || typeof body.data !== 'string') {
                        ctx.status = 400;
                        ctx.body = { error: "Invalid body" };
                        return;
                    }
                }
                await next();
            });

            router.post("/validate", (ctx) => {
                ctx.body = { validated: true, data: ctx.request.body };
            });
            router.get("/validate", (ctx) => {
                ctx.body = { validated: true };
            });
            break;

        case "long-pending":
            router.get("/delayed", async (ctx) => {
                await new Promise(r => setTimeout(r, 100));
                ctx.body = "done";
            });
            break;

        default:
            throw new Error(`Unknown scenario: ${scenario}`);
    }

    app.use(router.routes()).use(router.allowedMethods());

    const server = app.listen(port);

    return async () => {
        server.close();
    };
}
