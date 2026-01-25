
import { Shokupan } from '../../../../shokupan';

const app = new Shokupan();

// Test case 1: Variable Reuse
app.post('/var-reuse', async (ctx) => {
    const body = await ctx.body() as { id: string; count: number; };
    return ctx.json({
        success: true,
        data: body
    });
});

// Test case 2: Direct Object Literal
app.get('/literal', (ctx) => {
    return ctx.json({
        message: 'hello',
        status: 200,
        tags: ['a', 'b']
    });
});

// Test case 3: Nested Variable
app.post('/nested-reuse', async (ctx) => {
    const input = await ctx.body() as { name: string; };

    return ctx.json({
        meta: {
            timestamp: 12345,
            source: 'test'
        },
        payload: {
            user: input,
            active: true
        }
    });
});
