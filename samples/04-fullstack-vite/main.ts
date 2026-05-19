import { Shokupan, VitePlugin } from 'shokupan';

/**
 * Sample 4: Full-stack Vite Integration
 *
 * Demonstrates using Shokupan as a backend API with Vite
 * integration for fullstack development.
 */

const app = new Shokupan({
    port: 3004,
    development: true,
    enableOpenApiGen: true
});

// API routes
app.get('/api/health', (ctx) => {
    return ctx.json({ status: 'ok', service: 'fullstack-api' });
});

app.get('/api/items', (ctx) => {
    const items = [
        { id: 1, name: 'Item A', price: 10 },
        { id: 2, name: 'Item B', price: 20 },
        { id: 3, name: 'Item C', price: 30 }
    ];
    return ctx.json({ data: items });
});

app.get('/api/items/:id', (ctx) => {
    const items = [
        { id: 1, name: 'Item A', price: 10 },
        { id: 2, name: 'Item B', price: 20 },
        { id: 3, name: 'Item C', price: 30 }
    ];
    const item = items.find(i => i.id === parseInt(ctx.params.id));
    if (!item) {
        return ctx.json({ error: 'Item not found' }, 404);
    }
    return ctx.json({ data: item });
});

// Register Vite plugin for frontend dev server integration
// In production, this serves built assets with SPA fallback
await app.register(new VitePlugin({
    root: './frontend',
    spa: true
}));

app.listen().then(() => {
    console.log('Fullstack Vite App running on http://localhost:3004');
    console.log('API: http://localhost:3004/api/*');
    console.log('Frontend: http://localhost:3004 (served by Vite)');
});
