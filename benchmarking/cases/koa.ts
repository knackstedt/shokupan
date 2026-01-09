import Router from "@koa/router";
import type { Server } from "http";
import Koa from "koa";
import { MEDIUM_JSON } from "../data.ts";

export async function start(port: number) {
    const app = new Koa();
    const router = new Router();

    router.get("/static", (ctx) => {
        ctx.body = "Hello World";
    });

    router.get("/json", (ctx) => {
        ctx.body = MEDIUM_JSON;
    });

    router.get("/dynamic/:id", (ctx) => {
        ctx.body = `Dynamic content for ${ctx.params.id}`;
    });

    app.use(router.routes());
    app.use(router.allowedMethods());

    let server: Server;
    await new Promise<void>((resolve) => {
        server = app.listen(port, () => {
            resolve();
        });
    });

    return async () => {
        return new Promise<void>((resolve, reject) => {
            server.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    };
}
