import { Shokupan, ClusterPlugin } from '../src/index';

/**
 * Sample 8: Inventory API with Cluster Plugin
 * Tests: ClusterPlugin, multi-process, graceful shutdown
 */

const app = new Shokupan({
    port: 3110,
    development: false,
    enableOpenApiGen: true
});

interface InventoryItem {
    id: string;
    name: string;
    quantity: number;
    warehouse: string;
    lastUpdated: string;
}

const inventory: InventoryItem[] = [
    { id: '1', name: 'Widget A', quantity: 100, warehouse: 'NYC', lastUpdated: new Date().toISOString() },
    { id: '2', name: 'Widget B', quantity: 50, warehouse: 'LA', lastUpdated: new Date().toISOString() },
    { id: '3', name: 'Gadget', quantity: 200, warehouse: 'NYC', lastUpdated: new Date().toISOString() }
];

// Register cluster plugin (will fork workers in production, no-op in dev with <=1 workers)
await app.register(new ClusterPlugin({ workers: 1 }));

app.get('/health', () => ({ status: 'ok', service: 'cluster-inventory', pid: process.pid }));

app.get('/inventory', () => ({ data: inventory, count: inventory.length }));

app.get('/inventory/:id', (ctx) => {
    const item = inventory.find(i => i.id === ctx.params.id);
    if (!item) return ctx.json({ error: 'Item not found' }, 404);
    return { data: item };
});

app.post('/inventory', async (ctx) => {
    const body = await ctx.body() as { name?: string; quantity?: number; warehouse?: string };
    if (!body.name || body.quantity === undefined) return ctx.json({ error: 'Name and quantity required' }, 400);
    const item: InventoryItem = {
        id: String(inventory.length + 1),
        name: body.name,
        quantity: body.quantity,
        warehouse: body.warehouse || 'NYC',
        lastUpdated: new Date().toISOString()
    };
    inventory.push(item);
    return ctx.json({ data: item }, 201);
});

app.put('/inventory/:id', async (ctx) => {
    const item = inventory.find(i => i.id === ctx.params.id);
    if (!item) return ctx.json({ error: 'Item not found' }, 404);
    const body = await ctx.body() as Partial<InventoryItem>;
    Object.assign(item, body, { lastUpdated: new Date().toISOString() });
    return { data: item };
});

app.delete('/inventory/:id', (ctx) => {
    const index = inventory.findIndex(i => i.id === ctx.params.id);
    if (index === -1) return ctx.json({ error: 'Item not found' }, 404);
    const deleted = inventory.splice(index, 1)[0];
    return { data: deleted };
});

await app.listen();
console.log('Cluster Inventory API running on https://localhost:3110');
