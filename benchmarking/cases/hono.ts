import { Hono } from "hono";
import { MEDIUM_JSON } from "../data.ts";

export async function start(port: number) {
    const app = new Hono();

    app.get("/static", (c) => {
        return c.text("Hello World");
    });

    app.get("/json", (c) => {
        return c.json(MEDIUM_JSON);
    });

    app.get("/dynamic/:id", (c) => {
        const id = c.req.param("id");
        return c.text(`Dynamic content for ${id}`);
    });

    // Check if running on Bun
    if (typeof Bun !== "undefined") {
        // Use Bun.serve for Bun runtime
        const server = Bun.serve({
            port,
            fetch: app.fetch,
        });

        return async () => {
            server.stop();
        };
    } else if (typeof Deno !== "undefined") {
        // Use Deno.serve for Deno runtime
        // @ts-ignore
        const server = Deno.serve({
            port,
            onListen: () => { }, // Suppress default listener log if desired
        }, app.fetch);

        return async () => {
            await server.shutdown();
        };
    } else {
        // Use Node.js adapter for Node runtime
        const { serve } = await import("@hono/node-server");
        const server = serve({
            fetch: app.fetch,
            port,
        });

        return async () => {
            server.close();
        };
    }
}
