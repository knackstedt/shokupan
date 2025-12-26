import { Convection } from "../convect";
import { Body, Controller, Get, Post } from "../decorators";
import { Inject, Injectable } from "../di";

@Injectable()
class UserService {
    private users: string[] = ["Alice", "Bob"];

    getUsers() {
        return this.users;
    }

    addUser(name: string) {
        this.users.push(name);
    }
}

@Controller("/users")
class UserController {

    @Inject(UserService)
    private userService!: UserService;

    @Get("/")
    async list() {
        return this.userService.getUsers();
    }

    @Post("/")
    async create(@Body() body: any) {
        this.userService.addUser(body.name);
        return { message: "User added", users: this.userService.getUsers() };
    }
}

const app = new Convection({ port: 3003 });

app.mount("/api", UserController);

if (require.main === module) {
    app.listen();
}
