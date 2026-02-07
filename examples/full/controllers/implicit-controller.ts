import { Body, Get, Param, Post, Query } from '../../../src/decorators';

export class UserController {

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
