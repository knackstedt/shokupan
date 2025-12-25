import { beforeAll } from "bun:test";
import { Convection } from '../convect';
import { useExpress } from '../middleware';

beforeAll(async () => {

    const app = new Convection({
        port: 3000,
        development: true
    });

    // Middleware 1: Logger
    app.use(async (ctx, next) => {
        const start = Date.now();
        const res = await next();
        const duration = Date.now() - start;
        console.log(`[${ctx.method}] ${ctx.path} - ${duration}ms`);
        return res;
    });

    // Middleware 2: Legacy Express Middleware (Mock)
    app.use(useExpress((req: any, res: any, next: any) => {
        console.log("Legacy Express middleware called");
        next();
    }));

    // Route: Hello World
    app.get("/", (ctx) => {
        return "Hello World";
    });

    // Route: JSON
    app.get("/json", (ctx) => {
        return { message: "Hello JSON" };
    });

    // Route: Params
    app.get("/user/:id", (ctx) => {
        return { id: ctx.params['id'] };
    });

    class UserController {
        // GET /api/user/
        get(ctx: any) {
            return { message: "Root of UserController" };
        }

        // GET /api/user/profile
        getProfile(ctx: any) {
            return { profile: "Administrator" };
        }

        // POST /api/user/create
        postCreate(ctx: any) {
            return { status: "created", body: "TODO" };
        }
    }

    app.mount("/api/user", UserController);

    app.listen();

    (global as any).app = app;
});

