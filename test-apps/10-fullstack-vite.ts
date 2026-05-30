import { Shokupan, VitePlugin } from '../src/index';

/**
 * Sample 10: Fullstack with Vite
 * Tests: Vite integration, SPA fallback, backend API + frontend dev server
 */

const app = new Shokupan({
    port: 3112,
    development: true,
    enableOpenApiGen: true
});

// Backend API routes
app.get('/api/health', () => ({ status: 'ok', service: 'fullstack-vite' }));

app.get('/api/tasks', () => ({
    tasks: [
        { id: 1, title: 'Build frontend', done: true },
        { id: 2, title: 'Write tests', done: false },
        { id: 3, title: 'Deploy app', done: false }
    ]
}));

app.get('/api/tasks/:id', (ctx) => ({
    task: { id: parseInt(ctx.params.id), title: 'Task ' + ctx.params.id, done: false }
}));

app.post('/api/tasks', async (ctx) => {
    const body = await ctx.body() as { title?: string };
    if (!body.title) return ctx.json({ error: 'Title required' }, 400);
    return { task: { id: Date.now(), title: body.title, done: false } };
});

app.put('/api/tasks/:id', async (ctx) => {
    const body = await ctx.body() as { title?: string; done?: boolean };
    return { task: { id: parseInt(ctx.params.id), title: body.title || 'Updated', done: body.done ?? false } };
});

app.delete('/api/tasks/:id', (ctx) => ({
    message: 'Task ' + ctx.params.id + ' deleted'
}));

// Register Vite plugin for frontend serving
await app.register(new VitePlugin({
    // In a real app this would point to a vite project root
    // For testing, we just verify the plugin loads without error
    root: './test-apps',
    spaFallback: true
}));

await app.listen();
console.log('Fullstack Vite App running on https://localhost:3112');
