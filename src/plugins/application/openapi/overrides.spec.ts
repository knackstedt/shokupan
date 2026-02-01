import { describe, expect, test } from "bun:test";
import { ShokupanContext } from "../../../context";
import { Spec } from '../../../decorators';
import { Body, Controller, Get, Post } from '../../../decorators/http';
import { Shokupan } from "../../../shokupan";
import { PriorityController } from "./fixtures/priority-controller";

@Controller("/users")
class UserController {
    @Get("/")
    @Spec({ summary: "List Users (Decorator Override)" })
    listUsers(ctx: ShokupanContext) {
        return ctx.json([]);
    }

    @Post("/")
    @Spec({
        description: "Create User",
        responses: {
            "201": { description: "User Created" }
        }
    })
    createUser(ctx: ShokupanContext, @Body() body: any) {
        return ctx.json({ id: 1 }, 201);
    }
}

describe("OpenAPI Autogen - Overrides & Decorators", () => {
    test("should respect @Spec decorator", async () => {
        const app = new Shokupan({ enableOpenApiGen: true, port: 0 });
        app.mount("/api", UserController);

        const server = await app.listen();
        server.stop();

        const spec = app.openApiSpec;
        const usersPath = spec.paths["/api/users"];

        expect(usersPath).toBeDefined();
        expect(usersPath.get.summary).toBe("List Users (Decorator Override)");
        expect(usersPath.post.description).toBe("Create User");
        expect(usersPath.post.responses["201"].description).toBe("User Created");
    });

    test("manual override in route definition should merge", async () => {
        const app = new Shokupan({ enableOpenApiGen: true, port: 0 });

        app.get("/manual", { summary: "Manual Summary" }, (ctx) => ctx.text("ok"));

        const server = await app.listen();
        server.stop();

        const path = app.openApiSpec.paths["/manual"];
        expect(path.get.summary).toBe("Manual Summary");
    });

    test("Spec decorator should override AST in Priority Controller", async () => {
        const app = new Shokupan({ enableOpenApiGen: true, port: 0 });
        app.mount("/api", PriorityController);

        const server = await app.listen();
        server.stop();

        const spec = app.openApiSpec;
        const priorityPath = spec.paths["/api/priority"]; // /api + /priority (from controller) + / (method) = /api/priority

        expect(priorityPath).toBeDefined();
        // PriorityController uses @Spec to override AST summary
        expect(priorityPath.get.summary).toBe("Spec Summary");
    });
});
