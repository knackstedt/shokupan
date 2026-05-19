import 'reflect-metadata';
import { Shokupan, Controller, Get, Post, Body, Param, Injectable, Container } from 'shokupan';

/**
 * Sample 2: Decorator Controllers with Dependency Injection
 *
 * Demonstrates decorator-based routing (@Controller, @Get, @Post)
 * and dependency injection (@Injectable) in Shokupan.
 */

interface User {
    id: number;
    name: string;
    email: string;
}

@Injectable()
class UserService {
    private users: User[] = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' }
    ];
    private nextId = 3;

    findAll(): User[] {
        return this.users;
    }

    findById(id: number): User | undefined {
        return this.users.find(u => u.id === id);
    }

    create(data: Omit<User, 'id'>): User {
        const user: User = { id: this.nextId++, ...data };
        this.users.push(user);
        return user;
    }
}

@Injectable()
class EmailService {
    sendWelcome(email: string, name: string) {
        console.log(`[EmailService] Welcome email sent to ${name} <${email}>`);
        return { sent: true, to: email };
    }
}

@Controller('/users')
class UserController {
    constructor(
        private userService: UserService,
        private emailService: EmailService
    ) { }

    @Get('/')
    list() {
        return { data: this.userService.findAll() };
    }

    @Get('/:id')
    getById(@Param('id') id: string) {
        const user = this.userService.findById(parseInt(id));
        if (!user) {
            return { error: 'User not found' };
        }
        return { data: user };
    }

    @Post('/')
    create(@Body() body: { name: string; email: string }) {
        const user = this.userService.create(body);
        this.emailService.sendWelcome(user.email, user.name);
        return { data: user, message: 'User created' };
    }
}

const app = new Shokupan({
    port: 3002,
    development: true,
    enableOpenApiGen: true
});

app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    console.log(`${ctx.request.method} ${ctx.request.url} - ${ctx.response.status}ms`);
});

app.mount('/api', UserController);

app.listen().then(() => {
    console.log('Decorator Controller API running on http://localhost:3002');
    console.log('Try: curl http://localhost:3002/api/users');
});
