---
title: Controllers
description: Use decorators for structured class-based routing
---

Controllers provide a structured, class-based approach to defining routes using TypeScript decorators. This pattern is familiar to NestJS developers and helps organize your application.

## Basic Controller

Create a controller using the `@Get`, `@Post`, etc. decorators:

```typescript
import { Get, Post, Put, Delete, Param, Body } from 'shokupan';

export class UserController {
    
    @Get('/')
    async getAllUsers() {
        return {
            users: ['Alice', 'Bob', 'Charlie']
        };
    }
    
    @Get('/:id')
    async getUserById(@Param('id') id: string) {
        return {
            id,
            name: 'Alice',
            email: 'alice@example.com'
        };
    }
    
    @Post('/')
    async createUser(@Body() body: any) {
        return {
            message: 'User created',
            data: body
        };
    }
    
    @Put('/:id')
    async updateUser(
        @Param('id') id: string,
        @Body() body: any
    ) {
        return {
            message: 'User updated',
            id,
            data: body
        };
    }
    
    @Delete('/:id')
    async deleteUser(@Param('id') id: string) {
        return { message: 'User deleted', id };
    }
}
```

## Mounting Controllers

Mount a controller to a base path:

```typescript
import { Shokupan } from 'shokupan';

const app = new Shokupan();

// Mount at /api/users
app.mount('/api/users', UserController);

// Routes available:
// GET    /api/users
// GET    /api/users/:id
// POST   /api/users
// PUT    /api/users/:id
// DELETE /api/users/:id
```

## HTTP Method Decorators

All HTTP methods are supported:

```typescript
import { Get, Post, Put, Patch, Delete, Options, Head, All } from 'shokupan';

export class ApiController {
    
    @Get('/resource')
    getResource() { }
    
    @Post('/resource')
    createResource() { }
    
    @Put('/resource/:id')
    replaceResource() { }
    
    @Patch('/resource/:id')
    updateResource() { }
    
    @Delete('/resource/:id')
    deleteResource() { }
    
    @Options('/resource')
    resourceOptions() { }
    
    @Head('/resource')
    resourceHead() { }
    
    @All('/webhook')
    handleWebhook() { }
}
```

## Parameter Decorators

Extract data from requests using parameter decorators:

### @Param

Extract path parameters:

```typescript
@Get('/users/:userId/posts/:postId')
getPost(
    @Param('userId') userId: string,
    @Param('postId') postId: string
) {
    return { userId, postId };
}
```

### @Query

Extract query parameters:

```typescript
@Get('/search')
search(
    @Query('q') searchQuery: string,
    @Query('page') page?: string
) {
    return {
        query: searchQuery,
        page: page || '1'
    };
}
```

### @Body

Access the request body:

```typescript
@Post('/users')
async createUser(@Body() userData: any) {
    // userData is already parsed
    return { created: userData };
}
```

### @Headers

Access request headers:

```typescript
@Get('/protected')
getData(
    @Headers('authorization') token: string,
    @Headers('user-agent') userAgent: string
) {
    return { token, userAgent };
}
```

### @Ctx

Access the full context object:

```typescript
import { Ctx, ShokupanContext } from 'shokupan';

@Get('/info')
getInfo(@Ctx() ctx: ShokupanContext) {
    return {
        method: ctx.method,
        path: ctx.path,
        headers: Object.fromEntries(ctx.headers.entries())
    };
}
```

### @Req

Access the request object directly:

```typescript
import { Req } from 'shokupan';

@Post('/upload')
async upload(@Req() req: Request) {
    const formData = await req.formData();
    return { uploaded: true };
}
```

## Controller Middleware

Apply middleware to all routes in a controller using `@Use`:

```typescript
import { Use } from 'shokupan';

const authMiddleware = async (ctx, next) => {
    if (!ctx.headers.get('authorization')) {
        return ctx.json({ error: 'Unauthorized' }, 401);
    }
    ctx.state.user = { id: '123' };
    return next();
};

@Use(authMiddleware)
export class AdminController {
    
    @Get('/dashboard')
    getDashboard(@Ctx() ctx: any) {
        return { user: ctx.state.user };
    }
    
    @Get('/settings')
    getSettings(@Ctx() ctx: any) {
        return { user: ctx.state.user };
    }
}
```

## Method-Level Middleware

Apply middleware to specific methods:

```typescript
const logRequest = async (ctx, next) => {
    console.log(`${ctx.method} ${ctx.path}`);
    return next();
};

export class UserController {
    
    @Get('/')
    getAllUsers() {
        return { users: [] };
    }
    
    @Post('/')
    @Use(logRequest)
    createUser(@Body() body: any) {
        return { created: body };
    }
}
```

## Dependency Injection

Use the DI container in controllers:

```typescript
import { Container } from 'shokupan';

class UserService {
    getUsers() {
        return ['Alice', 'Bob'];
    }
}

Container.register('userService', UserService);

export class UserController {
    private userService: UserService;
    
    constructor() {
        this.userService = Container.resolve('userService');
    }
    
    @Get('/')
    getAllUsers() {
        return { users: this.userService.getUsers() };
    }
}
```

## Multiple Controllers

Organize your app with multiple controllers:

```typescript
// user.controller.ts
export class UserController {
    @Get('/')
    getUsers() { }
}

// post.controller.ts
export class PostController {
    @Get('/')
    getPosts() { }
}

// app.ts
import { Shokupan } from 'shokupan';

const app = new Shokupan();

app.mount('/api/users', UserController);
app.mount('/api/posts', PostController);
```

## TypeScript Configuration

For controllers to work, enable decorators in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## Next Steps

- [Middleware](/shokupan/core/middleware/) - Create custom middleware
- [Dependency Injection](/shokupan/advanced/dependency-injection/) - Advanced DI patterns
- [Validation](/shokupan/plugins/validation/) - Validate controller inputs
