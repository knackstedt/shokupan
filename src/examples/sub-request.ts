import { Convection } from "../convect";
import { Controller, Get } from "../decorators";

@Controller("/internal")
class InternalController {
    @Get("/data")
    async getData() {
        return { secret: 42, timestamp: Date.now() };
    }
}

const app = new Convection({ port: 3004 });

app.mount("/api", InternalController);

app.get("/aggregate", async (ctx) => {
    // Perform a sub-request to the internal API
    // This calls the router processing logic directly without a full HTTP network round-trip from the OS perspective if optimized,
    // but semantically it's a request dispatch within the app.

    // Note: In the current implementation of subRequest in router.ts, it calls this.root[$dispatch](req).

    const response = await app.subRequest({
        method: "GET",
        path: "/api/internal/data"
    });

    if (response.status !== 200) {
        return { error: "Failed to fetch internal data" };
    }

    const data = await response.json();

    return {
        message: "Aggregation result",
        internalData: data
    };
});

if (require.main === module) {
    app.listen();
}
