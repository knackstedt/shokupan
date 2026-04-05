import { Shokupan } from "../../src/shokupan";
import { MEDIUM_JSON } from "../data";

export async function start(port: number) {
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
        } as any
    });

    app.get("/static", (ctx) => {
        return ctx.text("Hello World");
    });

    app.get("/json", (ctx) => {
        return ctx.json(MEDIUM_JSON);
    });

    app.get("/dynamic/:id", (ctx) => {
        return ctx.text(`Dynamic content for ${ctx.params.id}`);
    });

    const server = await app.listen(port);

    return async () => {
        server.stop();
    };
}
