import { Shokupan } from 'shokupan';

/**
 * Sample 1: Basic REST API
 *
 * Demonstrates functional routing, middleware, and CRUD patterns
 * using Shokupan's Express-style API.
 */

interface Todo {
    id: number;
    title: string;
    completed: boolean;
    createdAt: string;
}

let todos: Todo[] = [
    { id: 1, title: 'Learn Shokupan', completed: false, createdAt: new Date().toISOString() },
    { id: 2, title: 'Build something amazing', completed: false, createdAt: new Date().toISOString() }
];
let nextId = 3;

const app = new Shokupan({
    port: 3001,
    development: true,
    enableOpenApiGen: true
});

// Request logging middleware
app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`${ctx.request.method} ${ctx.request.url} - ${ctx.response.status} (${duration}ms)`);
});

// Health check
app.get('/health', (ctx) => {
    return ctx.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// List all todos
app.get('/todos', (ctx) => {
    const { completed } = ctx.query;
    let result = todos;
    if (completed !== undefined) {
        const isCompleted = completed === 'true';
        result = todos.filter(t => t.completed === isCompleted);
    }
    return ctx.json({ data: result, count: result.length });
});

// Get single todo
app.get('/todos/:id', (ctx) => {
    const id = parseInt(ctx.params.id);
    const todo = todos.find(t => t.id === id);
    if (!todo) {
        return ctx.json({ error: 'Todo not found' }, 404);
    }
    return ctx.json({ data: todo });
});

// Create todo
app.post('/todos', async (ctx) => {
    const body = await ctx.body();
    if (!body || !body.title || typeof body.title !== 'string') {
        return ctx.json({ error: 'Title is required' }, 400);
    }
    const todo: Todo = {
        id: nextId++,
        title: body.title,
        completed: false,
        createdAt: new Date().toISOString()
    };
    todos.push(todo);
    return ctx.json({ data: todo }, 201);
});

// Update todo
app.put('/todos/:id', async (ctx) => {
    const id = parseInt(ctx.params.id);
    const todo = todos.find(t => t.id === id);
    if (!todo) {
        return ctx.json({ error: 'Todo not found' }, 404);
    }
    const body = await ctx.body();
    if (body.title !== undefined) todo.title = body.title;
    if (body.completed !== undefined) todo.completed = Boolean(body.completed);
    return ctx.json({ data: todo });
});

// Delete todo
app.delete('/todos/:id', (ctx) => {
    const id = parseInt(ctx.params.id);
    const index = todos.findIndex(t => t.id === id);
    if (index === -1) {
        return ctx.json({ error: 'Todo not found' }, 404);
    }
    const deleted = todos.splice(index, 1)[0];
    return ctx.json({ data: deleted });
});

// 404 handler
app.get('/*', (ctx) => {
    return ctx.json({ error: 'Not found' }, 404);
});

app.listen().then(() => {
    console.log('Basic REST API running on http://localhost:3001');
    console.log('Try: curl http://localhost:3001/todos');
});
