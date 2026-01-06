import { Shokupan } from './shokupan';

/**
 * Example demonstrating TypeScript path parameter type inference in Shokupan
 * Similar to Express's RouteParameters feature
 */
const app = new Shokupan();

// Example 1: Single path parameter
// Type inferred: { userId: string }
app.get('/users/:userId', (ctx) => {
    // ✓ TypeScript knows userId exists
    const userId = ctx.params.userId;

    return ctx.json({ userId });
});

// Example 2: Multiple path parameters
// Type inferred: { userId: string, postId: string }
app.get('/users/:userId/posts/:postId', (ctx) => {
    // ✓ TypeScript knows both params exist
    const { userId, postId } = ctx.params;

    return ctx.json({ userId, postId });
});

// Example 3: Complex nested routes
// Type inferred: { category: string, subcategory: string, itemId: string }
app.get('/shop/:category/:subcategory/items/:itemId', (ctx) => {
    const { category, subcategory, itemId } = ctx.params;

    return ctx.json({ category, subcategory, itemId });
});

// Example 4: POST with path params
app.post('/api/v1/users/:userId', (ctx) => {
    const userId = ctx.params.userId;
    // Can also access body
    const body = ctx.body();

    return ctx.json({ userId, updated: true });
});

// Example 5: With OpenAPI spec
app.put('/articles/:articleId', {
    summary: 'Update an article',
    tags: ['articles']
}, (ctx) => {
    const articleId = ctx.params.articleId;
    return ctx.json({ articleId, updated: true });
});

// Example 6: Routes without params work too
// Type: Record<string, string> (fallback)
app.get('/health', (ctx) => {
    return ctx.json({ status: 'ok' });
});

console.log('✓ TypeScript path parameter inference examples created successfully');
console.log('✓ Run this file to see it in action, or check in your IDE for autocomplete!');

export default app;
