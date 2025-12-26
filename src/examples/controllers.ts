import { Convection } from "../convect";
import { Body, Controller, Get, Param, Post, Query } from "../decorators";

@Controller("/users")
class UserController {

    @Get("/")
    async getUsers(@Query("role") role: string) {
        return {
            message: "Getting all users",
            filter: role ? `Filter by role: ${role}` : "No filter"
        };
    }

    @Get("/:id")
    async getUserById(@Param("id") id: string) {
        return {
            id,
            name: "John Doe",
            role: "Admin"
        };
    }

    @Post("/")
    async createUser(@Body() body: any) {
        return {
            message: "User created",
            data: body
        };
    }
}

const app = new Convection({ port: 3001 });

// Mount the controller
app.mount("/api", UserController);

if (require.main === module) {
    app.listen();
}
