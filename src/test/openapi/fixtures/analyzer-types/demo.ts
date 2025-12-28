
import { Shokupan } from '../../../../shokupan';

const app = new Shokupan();

// Test case 1: Simple object assertion
app.post('/users', async (ctx) => {
    const body = await ctx.body() as { name: string; age: number; };
    return ctx.json({ created: true });
});

// Test case 2: Nested object assertion
app.post('/products', async (ctx) => {
    const body = await ctx.body() as {
        title: string;
        details: {
            price: number;
            inStock: boolean;
        };
    };
    return ctx.json({ created: true });
});

// Test case 3: Array assertion
app.post('/batch', async (ctx) => {
    const body = await ctx.body() as { items: string[]; };
    return ctx.json({ processed: true });
});

// Test case 4: Generic object (no specific type)
app.post('/generic', async (ctx) => {
    const body = await ctx.body();
    return ctx.json({ ok: true });
});
