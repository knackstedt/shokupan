
import { ConvectionContext } from '../context';
import { Convection } from '../convect';
import { ConvectionRouter } from '../router';

// Mock controller
class UserController {
    get(ctx: ConvectionContext) { return "getAll"; }
    getProfile(ctx: ConvectionContext) { return "getProfile"; }
    postCreate(ctx: ConvectionContext) { return "create"; }
}

async function test() {
    console.log("Starting Tree Test...");

    const app = new Convection();

    // Level 1 Router
    const apiRouter = new ConvectionRouter();
    apiRouter.get("/status", () => "ok");

    // Level 2 Router
    const v1Router = new ConvectionRouter();
    v1Router.get("/version", () => "v1");

    // Mount logic
    apiRouter.mount("/v1", v1Router);
    app.mount("/api", apiRouter);

    // Mount controller
    app.mount("/users", UserController);

    // Check routes
    const routes = app.getRoutes();
    console.log("Generated Routes:");
    routes.forEach(r => console.log(`${r.method} ${r.path}`));

    // Assertions
    const paths = routes.map(r => `${r.method} ${r.path}`);

    // Expected:
    // GET /api/status (from apiRouter)
    // GET /api/v1/version (from v1Router inside apiRouter)
    // GET /users (from UserController.get)
    // GET /users/profile (from UserController.getProfile)
    // POST /users/create (from UserController.postCreate)

    const expected = [
        "GET /api/status",
        "GET /api/v1/version",
        "GET /users",
        "GET /users/profile", // or /users/profile depending on logic
        "POST /users/create"
    ];

    let success = true;
    for (const exp of expected) {
        if (!paths.includes(exp)) {
            console.error(`MISSING: ${exp}`);
            success = false;
        } else {
            console.log(`FOUND: ${exp}`);
        }
    }

    if (success) {
        console.log("Tree Test PASSED");
    } else {
        console.error("Tree Test FAILED");
        process.exit(1);
    }
}

test();
