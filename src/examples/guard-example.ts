import { Convection } from '../convect';

const app = new Convection({
    port: 3000
});

// Public route - added before guards, so no guards apply
app.get('/public', async (ctx) => {
    return ctx.json({ message: 'This is public' });
});

// Add a guard that checks for authentication
// This applies to all routes added AFTER this point
app.guard(async (ctx) => {
    const authHeader = ctx.req.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // Return response to short-circuit
        return ctx.json({ error: 'Unauthorized' }, 401);
    }

    // Return true to allow continuation
    console.log('Auth check passed');
    return true;
});

// Protected routes - guards apply
app.get('/protected/data', async (ctx) => {
    return ctx.json({ data: 'Secret information' });
});

// Add another guard for API key - stacks with auth guard
app.guard({
    summary: 'API Key Guard',
    description: 'Validates API key for all subsequent routes',
    responses: {
        403: { description: 'Invalid API key' }
    }
}, async (ctx) => {
    const apiKey = ctx.req.headers.get('X-API-Key');

    if (!apiKey || apiKey !== 'secret-key') {
        return ctx.json({ error: 'Invalid API key' }, 403);
    }

    console.log('API key validated');
    return true;
});

// This route requires BOTH auth AND API key
app.get('/api/users', async (ctx) => {
    return ctx.json({ users: ['Alice', 'Bob'] });
});

console.log('Testing guard example...\n');

// Test cases
async function testGuards() {
    // Test 1: Access public route (no guards)
    console.log('Test 1: Public route (no guards)');
    let res = await app.processRequest({ path: '/public' });
    console.log('Status:', res.status, 'Data:', res.data);
    console.log();

    // Test 2: Access protected route without auth
    console.log('Test 2: Protected route without auth');
    res = await app.processRequest({ path: '/protected/data' });
    console.log('Status:', res.status, 'Data:', res.data);
    console.log();

    // Test 3: Access protected route with auth
    console.log('Test 3: Protected route with auth');
    res = await app.processRequest({
        path: '/protected/data',
        headers: { 'Authorization': 'Bearer valid-token' }
    });
    console.log('Status:', res.status, 'Data:', res.data);
    console.log();

    // Test 4: Access API route without API key (has auth)
    console.log('Test 4: API route with auth but no API key');
    res = await app.processRequest({
        path: '/api/users',
        headers: { 'Authorization': 'Bearer valid-token' }
    });
    console.log('Status:', res.status, 'Data:', res.data);
    console.log();

    // Test 5: Access API route with both auth and API key
    console.log('Test 5: API route with both auth and API key');
    res = await app.processRequest({
        path: '/api/users',
        headers: {
            'Authorization': 'Bearer valid-token',
            'X-API-Key': 'secret-key'
        }
    });
    console.log('Status:', res.status, 'Data:', res.data);
}

testGuards();
