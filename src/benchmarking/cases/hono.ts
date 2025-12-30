import { Hono } from "hono";
import { MEDIUM_JSON } from "../data";

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

    const server = Bun.serve({
        port,
        fetch: app.fetch,
    });

    return async () => {
        server.stop();
    };
}
