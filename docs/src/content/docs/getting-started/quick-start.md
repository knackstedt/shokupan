---
title: Quick Start
description: Build your first Shokupan application
---

This guide will walk you through building a simple RESTful API with Shokupan.

## What We'll Build

A simple TODO API with the following features:
- List all todos
- Get a single todo
- Create a new todo
- Update a todo
- Delete a todo

## Basic Setup

First, make sure you have [Shokupan installed](/shokupan/getting-started/installation/).

Create a new file `app.ts`:

```typescript
import { Shokupan } from 'shokupan';

const app = new Shokupan({
    port: 3000,
    development: true
});

// In-memory storage (use a database in production!)
const todos: Array<{ id: number; title: string; completed: boolean }> = [];
let nextId = 1;

// Routes will go here

app.listen();
console.log('🍞 Server running at http://localhost:3000');
```

## Adding Routes

### List All Todos

```typescript
app.get('/todos', (ctx) => {
    return { todos };
});
```

### Get Single Todo

```typescript
app.get('/todos/:id', (ctx) => {
    const id = parseInt(ctx.params.id);
    const todo = todos.find(t => t.id === id);
    
    if (!todo) {
        return ctx.json({ error: 'Todo not found' }, 404);
    }
    
    return { todo };
});
```

### Create Todo

```typescript
app.post('/todos', async (ctx) => {
    const body = await ctx.body();
    
    const todo = {
        id: nextId++,
        title: body.title,
        completed: false
    };
    
    todos.push(todo);
    
    return ctx.json({ todo }, 201);
});
```

### Update Todo

```typescript
app.put('/todos/:id', async (ctx) => {
    const id = parseInt(ctx.params.id);
    const todo = todos.find(t => t.id === id);
    
    if (!todo) {
        return ctx.json({ error: 'Todo not found' }, 404);
    }
    
    const body = await ctx.body();
    
    if (body.title !== undefined) todo.title = body.title;
    if (body.completed !== undefined) todo.completed = body.completed;
    
    return { todo };
});
```

### Delete Todo

```typescript
app.delete('/todos/:id', (ctx) => {
    const id = parseInt(ctx.params.id);
    const index = todos.findIndex(t => t.id === id);
    
    if (index === -1) {
        return ctx.json({ error: 'Todo not found' }, 404);
    }
    
    todos.splice(index, 1);
    
    return { message: 'Todo deleted' };
});
```

## Adding Validation

Let's add validation using Zod:

```bash
bun add zod
```

Update your todo creation route:

```typescript
import { validate } from 'shokupan';
import { z } from 'zod';

const createTodoSchema = z.object({
    title: z.string().min(1, 'Title is required'),
});

app.post('/todos',
    validate({ body: createTodoSchema }),
    async (ctx) => {
        const body = await ctx.body();
        
        const todo = {
            id: nextId++,
            title: body.title,
            completed: false
        };
        
        todos.push(todo);
        
        return ctx.json({ todo }, 201);
    }
);
```

## Adding Middleware

Let's add a simple logging middleware:

```typescript
app.use(async (ctx, next) => {
    const start = Date.now();
    console.log(`→ ${ctx.method} ${ctx.path}`);
    
    const result = await next();
    
    const duration = Date.now() - start;
    console.log(`← ${ctx.method} ${ctx.path} - ${duration}ms`);
    
    return result;
});
```

## Using Controllers

For better organization, let's refactor using controllers:

```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, Ctx } from 'shokupan';
import { validate } from 'shokupan';
import { z } from 'zod';

const todos: Array<{ id: number; title: string; completed: boolean }> = [];
let nextId = 1;

const createTodoSchema = z.object({
    title: z.string().min(1),
});

export class TodoController {
    
    @Get('/')
    getAllTodos() {
        return { todos };
    }
    
    @Get('/:id')
    getTodo(@Param('id') idStr: string, @Ctx() ctx: any) {
        const id = parseInt(idStr);
        const todo = todos.find(t => t.id === id);
        
        if (!todo) {
            return ctx.json({ error: 'Todo not found' }, 404);
        }
        
        return { todo };
    }
    
    @Post('/')
    async createTodo(@Body() body: any) {
        const todo = {
            id: nextId++,
            title: body.title,
            completed: false
        };
        
        todos.push(todo);
        
        return { todo };
    }
    
    @Put('/:id')
    async updateTodo(
        @Param('id') idStr: string,
        @Body() body: any,
        @Ctx() ctx: any
    ) {
        const id = parseInt(idStr);
        const todo = todos.find(t => t.id === id);
        
        if (!todo) {
            return ctx.json({ error: 'Todo not found' }, 404);
        }
        
        if (body.title !== undefined) todo.title = body.title;
        if (body.completed !== undefined) todo.completed = body.completed;
        
        return { todo };
    }
    
    @Delete('/:id')
    deleteTodo(@Param('id') idStr: string, @Ctx() ctx: any) {
        const id = parseInt(idStr);
        const index = todos.findIndex(t => t.id === id);
        
        if (index === -1) {
            return ctx.json({ error: 'Todo not found' }, 404);
        }
        
        todos.splice(index, 1);
        
        return { message: 'Todo deleted' };
    }
}

// Mount the controller
app.mount('/todos', TodoController);
```

## Testing the API

Start your server:

```bash
bun run app.ts
```

Test with curl:

```bash
# Create a todo
curl -X POST http://localhost:3000/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Learn Shokupan"}'

# Get all todos
curl http://localhost:3000/todos

# Get a specific todo
curl http://localhost:3000/todos/1

# Update a todo
curl -X PUT http://localhost:3000/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'

# Delete a todo
curl -X DELETE http://localhost:3000/todos/1
```

## Next Steps

Great! You've built your first Shokupan API. Now explore:

- [Routing](/shokupan/core/routing/) - Advanced routing patterns
- [Middleware](/shokupan/core/middleware/) - Create custom middleware
- [Validation](/shokupan/plugins/validation/) - Deep dive into validation
- [Authentication](/shokupan/plugins/authentication/) - Add OAuth2 authentication
- [OpenAPI](/shokupan/advanced/openapi/) - Generate API documentation
