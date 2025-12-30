import Hapi from "@hapi/hapi";
import { MEDIUM_JSON } from "../data";

export async function start(port: number) {
    const server = Hapi.server({
        port: port,
        host: 'localhost',
        debug: false
    });

    server.route({
        method: 'GET',
        path: '/static',
        handler: (request, h) => {
            return "Hello World";
        }
    });

    server.route({
        method: 'GET',
        path: '/json',
        handler: (request, h) => {
            return MEDIUM_JSON;
        }
    });

    server.route({
        method: 'GET',
        path: '/dynamic/{id}',
        handler: (request, h) => {
            return `Dynamic content for ${request.params.id}`;
        }
    });

    await server.start();

    return async () => {
        await server.stop();
    };
}
