import { Shokupan, HtmxPlugin } from 'shokupan';

/**
 * Sample 9: HTMX Fullstack Application
 *
 * Demonstrates server-side rendering with HTMX for interactive
 * partial page updates without writing JavaScript.
 */

const app = new Shokupan({ port: 3009 });

interface Todo {
    id: number;
    text: string;
    done: boolean;
}

const todos: Todo[] = [
    { id: 1, text: 'Buy groceries', done: false },
    { id: 2, text: 'Walk the dog', done: true }
];
let nextId = 3;

// Layout wrapper
const layout = (content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HTMX + Shokupan Todo App</title>
    <script src="https://unpkg.com/htmx.org@1.9.12"></script>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; }
        h1 { color: #333; }
        .todo { display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid #eee; }
        .todo.done { text-decoration: line-through; color: #888; }
        .todo button { margin-left: auto; background: #dc3545; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; }
        .todo button:hover { background: #c82333; }
        form { display: flex; gap: 10px; margin-bottom: 20px; }
        input[type="text"] { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        button[type="submit"] { padding: 8px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .empty { color: #888; font-style: italic; padding: 20px 0; }
    </style>
</head>
<body>
    <h1>HTMX + Shokupan Todo App</h1>
    ${content}
</body>
</html>`;

// Todo list partial
const todoListPartial = () => {
    if (todos.length === 0) {
        return '<div class="empty">No todos yet. Add one above!</div>';
    }
    return todos.map(todo => `
        <div class="todo ${todo.done ? 'done' : ''}" id="todo-${todo.id}">
            <input type="checkbox"
                ${todo.done ? 'checked' : ''}
                hx-post="/todos/${todo.id}/toggle"
                hx-target="#todo-${todo.id}"
                hx-swap="outerHTML">
            <span>${todo.text}</span>
            <button hx-delete="/todos/${todo.id}"
                hx-target="#todo-${todo.id}"
                hx-swap="outerHTML"
                hx-confirm="Delete this todo?">Delete</button>
        </div>
    `).join('');
};

// Main page
app.get('/', () => {
    const html = layout(`
        <form hx-post="/todos" hx-target="#todo-list" hx-swap="innerHTML">
            <input type="text" name="text" placeholder="What needs to be done?" required autofocus>
            <button type="submit">Add Todo</button>
        </form>
        <div id="todo-list" hx-get="/todos/partial" hx-trigger="load">
            ${todoListPartial()}
        </div>
    `);
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
});

// Partial: todo list (for HTMX swaps)
app.get('/todos/partial', () => {
    const html = todoListPartial();
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
});

// Create todo
app.post('/todos', async (ctx) => {
    const body = await ctx.body() as { text?: string };
    if (!body.text?.trim()) {
        return ctx.json({ error: 'Todo text is required' }, 400);
    }

    const todo: Todo = {
        id: nextId++,
        text: body.text.trim(),
        done: false
    };
    todos.push(todo);

    // Return updated list for HTMX
    const html = todoListPartial();
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
});

// Toggle todo
app.post('/todos/:id/toggle', (ctx) => {
    const id = parseInt(ctx.params.id);
    const todo = todos.find(t => t.id === id);
    if (!todo) return ctx.json({ error: 'Not found' }, 404);

    todo.done = !todo.done;

    const html = `
        <div class="todo ${todo.done ? 'done' : ''}" id="todo-${todo.id}">
            <input type="checkbox"
                ${todo.done ? 'checked' : ''}
                hx-post="/todos/${todo.id}/toggle"
                hx-target="#todo-${todo.id}"
                hx-swap="outerHTML">
            <span>${todo.text}</span>
            <button hx-delete="/todos/${todo.id}"
                hx-target="#todo-${todo.id}"
                hx-swap="outerHTML"
                hx-confirm="Delete this todo?">Delete</button>
        </div>
    `;
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
});

// Delete todo
app.delete('/todos/:id', (ctx) => {
    const id = parseInt(ctx.params.id);
    const idx = todos.findIndex(t => t.id === id);
    if (idx === -1) return ctx.json({ error: 'Not found' }, 404);

    todos.splice(idx, 1);
    return new Response('', { status: 200 });
});

// Health check
app.get('/health', () => ({ status: 'ok', service: 'htmx-fullstack' }));

await app.listen();
console.log('HTMX Fullstack App running on http://localhost:3009');
console.log('Open http://localhost:3009 in your browser');
