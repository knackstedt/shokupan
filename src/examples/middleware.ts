import { Convection } from "../convect";
import { Controller, Get, Use } from "../decorators";

// Global Middleware
const loggerMiddleware = async (ctx: any, next: any) => {
    const start = Date.now();
    console.log(`[${ctx.req.method}] ${ctx.req.url} - Start`);
    const result = await next();
    const ms = Date.now() - start;
    console.log(`[${ctx.req.method}] ${ctx.req.url} - End (${ms}ms)`);
    return result;
};

// Route Middleware
const authMiddleware = async (ctx: any, next: any) => {
    const authHeader = ctx.req.headers.get("Authorization");
    if (!authHeader) {
        return ctx.json({ error: "Unauthorized" }, 401);
    }
    return next();
};

@Controller("/protected")
@Use(authMiddleware) // Applied to all methods in this controller
class ProtectedController {

    @Get("/data")
    async getData() {
        return { secret: "This is protected data" };
    }
}

@Controller("/public")
class PublicController {

    @Get("/info")
    @Use(loggerMiddleware) // Applied only to this method (duplicates global but shows usage)
    async getInfo() {
        return { info: "This is public info" };
    }
}

const app = new Convection({ port: 3002 });

app.use(loggerMiddleware);

app.mount("/api", ProtectedController);
app.mount("/api", PublicController);

if (require.main === module) {
    app.listen();
}
