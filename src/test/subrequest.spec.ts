
import { describe, expect, test } from "bun:test";
import { Convection } from '../convect';
import { ConvectionRouter } from '../router';
import { $dispatch } from '../symbol';

describe("SubRequest (Forking)", () => {
    // Setup app and router once
    const app = new Convection();
    const router = new ConvectionRouter();

    // Define a target route that handles ANY method
    const targetHandler = (ctx: any) => {
        return { message: "target hit", method: ctx.req.method };
    };
    router.get("/target", targetHandler);
    router.post("/target", targetHandler);

    // Define a forking route
    router.get("/proxy", async (ctx) => {
        // console.log("Proxying request...");
        const response = await router.subRequest({
            path: "/api/target",
            method: "POST", // Change method
            body: { foo: "bar" } // Add body
        });

        if (!response.ok) {
            console.error("Subrequest failed:", response.status, await response.text());
            return { error: "Subrequest failed" };
        }
        return await response.json();
    });

    // Define a streaming target
    router.get("/stream", (ctx) => {
        return new Response(new ReadableStream({
            start(controller) {
                controller.enqueue("chunk1");
                controller.enqueue("chunk2");
                controller.close();
            }
        }));
    });

    // Define a stream proxy
    router.get("/proxy-stream", async (ctx) => {
        const response = await router.subRequest({
            path: "/api/stream"
        });
        return response; // Return the response directly to pipe the stream
    });

    app.mount("/api", router);

    test("should successfully fork a request and return JSON", async () => {
        const req = new Request("http://localhost:3000/api/proxy");
        const res = await app[$dispatch](req);
        const data = await res.json() as any;

        expect(data.message).toBe("target hit");
        expect(data.method).toBe("POST");
    });

    test("should successfully fork a streaming response", async () => {
        const req = new Request("http://localhost:3000/api/proxy-stream");
        const res = await app[$dispatch](req);
        const text = await res.text();

        expect(text).toBe("chunk1chunk2");
    });
});
