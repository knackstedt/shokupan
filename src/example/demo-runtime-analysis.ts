import { ScalarPlugin } from '../plugins/scalar';
import { Shokupan } from '../shokupan';

const app = new Shokupan({
    port: 3002,
    development: true,
});

// Demonstrates automatic type detection from type conversions
app.get('/users', (ctx) => {
    const role = ctx.query.role;                    // string (default)
    const page = parseInt(ctx.query.page);          // integer ← Detected!
    const limit = parseInt(ctx.query.limit);        // integer ← Detected!
    const active = Boolean(ctx.query.active);       // boolean ← Detected!

    return ctx.json({
        users: [],
        filters: { role, page, limit, active }
    });
});

app.post('/users', async (ctx) => {
    const body = await ctx.body();                  // request body ← Detected!
    return ctx.json({
        created: true,
        user: body
    });
});

app.post('/users/data', async (ctx) => {
    const body = await ctx.body() as { name: string; age: number; };                  // request body ← Detected!
    return ctx.json({
        created: true,
        user: body
    });
});

app.get('/users/:id', (ctx) => {
    const id = parseInt(ctx.params.id);             // integer path param ← Detected!
    return ctx.json({
        user: { id, name: 'John Doe' }
    });
});

app.get('/products', (ctx) => {
    const category = ctx.query.category;            // string
    const minPrice = parseFloat(ctx.query.minPrice); // float ← Detected!
    const maxPrice = parseFloat(ctx.query.maxPrice); // float ← Detected!
    const inStock = !!ctx.query.inStock;            // boolean ← Detected!

    return ctx.json({
        products: [],
        filters: { category, minPrice, maxPrice, inStock }
    });
});

// Route with explicit spec that gets enhanced by runtime analysis
app.get('/search',
    {
        summary: 'Search items',
        description: 'Search for items by query string with pagination',
        tags: ['Search']
    },
    (ctx) => {
        const q = ctx.query.q;                       // string
        const filter = ctx.query.filter;             // string
        const page = parseInt(ctx.query.page);       // integer ← Auto-added!
        const limit = parseInt(ctx.query.limit);     // integer ← Auto-added!

        return ctx.json({
            results: [],
            query: { q, filter, page, limit }
        });
    }
);

// Mount enhanced Scalar viewer
app.mount('/docs', new ScalarPlugin({
    baseDocument: {
        info: {
            title: 'Runtime Analysis Demo API',
            version: '1.0.0',
            description: 'Demonstrates automatic OpenAPI spec generation with type detection from code patterns'
        }
    },
    config: {}
}));

console.log('🚀 Demo server with runtime type detection running...');
console.log('📖 Visit http://localhost:3002/docs to see the OpenAPI spec');
console.log('');
console.log('✨ Notice how parameters are automatically typed:');
console.log('   • parseInt() → integer');
console.log('   • parseFloat() → number (float)');
console.log('   • Boolean() or !! → boolean');
console.log('   • default → string');

app.listen();
