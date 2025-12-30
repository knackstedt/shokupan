import { Elysia } from "elysia";
import { MEDIUM_JSON } from "../data";

export async function start(port: number) {
    const app = new Elysia()
        .get("/static", () => "Hello World")
        .get("/json", () => MEDIUM_JSON)
        .get("/dynamic/:id", ({ params: { id } }) => `Dynamic content for ${id}`)
        .listen(port);

    return async () => {
        app.stop();
    };
}
