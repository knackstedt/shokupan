
import { describe, expect, test } from "bun:test";
import { Body, Controller, Ctx, Get, Headers, Param, Post, Query, Req, Use } from '../../decorators';
import { Inject, Injectable } from '../../di';
import { Shokupan } from '../../shokupan';

// 1. Dependency Injection Service
@Injectable()
class UserService {
    getUsers() {
        return ["Alice", "Bob"];
    }
}

// 2. Middleware
const LoggerMiddleware = async (ctx: any, next: any) => {
    const res = await next();
    if (res && typeof res === 'object' && !res.error) {
        return { data: res, log: "seen" };
    }
    return res;
};

const AuthMiddleware = async (ctx: any, next: any) => {
    if (ctx.req.headers.get("authorization") !== "secret") {
        return { error: "Unauthorized" };
    }
    return next();
};

// 3. Controller with DI, Class Decorator, Middleware, and Param Decorators
@Controller("/users")
@Use(LoggerMiddleware)
class UsersController {
    @Inject(UserService)
    private userService!: UserService;

    @Get("/")
    list() {
        return this.userService.getUsers();
    }

    @Post("/create")
    @Use(AuthMiddleware)
    create(@Body() body: any, @Headers("user-agent") ua: string) {
        return {
            created: body,
            ua
        };
    }

    @Get("/:id")
    getOne(@Param("id") id: string, @Query("detail") detail: string) {
        return { id, detail };
    }

    @Get("/ctx/test")
    ctxTest(@Ctx() ctx: any, @Req() req: any) {
        return {
            hasCtx: !!ctx,
            hasReq: !!req,
            url: req.url
        };
    }
}

// 4. Test Suite
describe("Shokupan Advanced Features", () => {
    const app = new Shokupan();
    app.mount("/api", UsersController);

    test("Dependency Injection should resolve service", async () => {
        const res = await app.processRequest({ path: "/api/users" });
        expect(res.status).toBe(200);
        expect(res.data).toEqual({
            data: ["Alice", "Bob"],
            log: "seen" // Class Middleware
        });
    });

    test("Method Middleware should enforce auth", async () => {
        // Fail case
        const resFail = await app.processRequest({
            method: "POST",
            path: "/api/users/create",
            body: { name: "Charlie" }
        });
        expect(resFail.data).toEqual({ error: "Unauthorized" });

        // Success case
        const resSuccess = await app.processRequest({
            method: "POST",
            path: "/api/users/create",
            headers: { "authorization": "secret", "user-agent": "BunTest" },
            body: { name: "Charlie" }
        });
        expect(resSuccess.data).toEqual({
            data: {
                created: { name: "Charlie" },
                ua: "BunTest"
            },
            log: "seen"
        });
    });

    test("Param Decorators (Param, Query)", async () => {
        const res = await app.processRequest({ path: "/api/users/123?detail=full" });
        expect(res.data).toEqual({
            data: { id: "123", detail: "full" },
            log: "seen"
        });
    });

    test("Ctx and Req Decorators", async () => {
        const res = await app.processRequest({ path: "/api/users/ctx/test" });
        expect(res.data.data.hasCtx).toBe(true);
        expect(res.data.data.hasReq).toBe(true);
    });
});
