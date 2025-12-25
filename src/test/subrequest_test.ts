import { Convection } from '../convect';
import { ConvectionRouter } from '../router';
import { $dispatch } from '../symbol';

async function testSubRequest() {
    console.log("Starting SubRequest Test...");

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
        console.log("Proxying request...");
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


    // Test 1: JSON Proxy
    // Use dispatch directly to avoid binding ports
    const req1 = new Request("http://localhost:3000/api/proxy");
    const res1 = await app[$dispatch](req1);
    const data1 = await res1.json() as any;

    console.log("Test 1 Result:", data1);

    // We expect the proxy to have called /api/target with POST
    // Wait, the target handler returns { message: "target hit", method: ctx.req.method }
    // If subRequest worked, method should be POST.

    if (data1.message === "target hit" && data1.method === "POST") {
        console.log("Test 1 PASSED");
    } else {
        console.error("Test 1 FAILED");
    }


    // Test 2: Stream Proxy
    const req2 = new Request("http://localhost:3000/api/proxy-stream");
    const res2 = await app[$dispatch](req2);
    const text2 = await res2.text();

    console.log("Test 2 Result:", text2);

    if (text2 === "chunk1chunk2") {
        console.log("Test 2 PASSED");
    } else {
        console.error("Test 2 FAILED");
    }

    if (data1.message === "target hit" && data1.method === "POST" && text2 === "chunk1chunk2") {
        console.log("ALL TESTS PASSED");
    } else {
        process.exit(1);
    }

}

testSubRequest();
