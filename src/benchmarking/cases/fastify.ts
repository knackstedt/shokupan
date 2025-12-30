import Fastify from "fastify";
import { MEDIUM_JSON } from "../data";

export async function start(port: number) {
    const fastify = Fastify({
        logger: false
    });

    fastify.get("/static", async (request, reply) => {
        return "Hello World";
    });

    fastify.get("/json", async (request, reply) => {
        return MEDIUM_JSON;
    });

    fastify.get("/dynamic/:id", async (request, reply) => {
        const { id } = request.params as any;
        return `Dynamic content for ${id}`;
    });

    await fastify.listen({ port });

    return async () => {
        await fastify.close();
    };
}
