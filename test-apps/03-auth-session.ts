import { Shokupan, Session, SecurityHeaders, RateLimitMiddleware } from '../src/index';

/**
 * Sample 3: Auth + Sessions App
 * Tests: Session middleware, cookie handling, authenticated routes
 */

const app = new Shokupan({
    port: 3103,
    development: true,
    enableOpenApiGen: true
});

// Session middleware
app.use(Session({
    secret: 'test-secret-key-for-sessions-32-chars-long',
    cookie: { secure: false, httpOnly: true, sameSite: 'strict' }
}));

app.use(SecurityHeaders());
app.use(RateLimitMiddleware({ windowMs: 60000, max: 100 }));

// Request logging
app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    console.log(`${ctx.request.method} ${ctx.request.url} - ${ctx.response.status} (${Date.now() - start}ms)`);
});

interface User {
    id: string;
    username: string;
    role: 'user' | 'admin';
}

const users = new Map<string, { password: string; user: User }>([
    ['alice', { password: 'alice123', user: { id: '1', username: 'alice', role: 'user' } }],
    ['admin', { password: 'admin123', user: { id: '2', username: 'admin', role: 'admin' } }]
]);

// Health
app.get('/health', () => ({ status: 'ok', service: 'auth-session' }));

// Login
app.post('/auth/login', async (ctx) => {
    const body = await ctx.body() as { username?: string; password?: string };
    if (!body.username || !body.password) {
        return ctx.json({ error: 'Username and password required' }, 400);
    }
    const record = users.get(body.username);
    if (!record || record.password !== body.password) {
        return ctx.json({ error: 'Invalid credentials' }, 401);
    }
    ctx.session.user = record.user;
    return ctx.json({ message: 'Logged in', user: record.user });
});

// Logout
app.post('/auth/logout', (ctx) => {
    delete ctx.session.user;
    return ctx.json({ message: 'Logged out' });
});

// Get current user
app.get('/auth/me', (ctx) => {
    if (!ctx.session.user) {
        return ctx.json({ error: 'Not authenticated' }, 401);
    }
    return ctx.json({ user: ctx.session.user });
});

// Protected admin route
app.get('/admin/dashboard', (ctx) => {
    if (!ctx.session.user) {
        return ctx.json({ error: 'Unauthorized' }, 401);
    }
    if (ctx.session.user.role !== 'admin') {
        return ctx.json({ error: 'Forbidden' }, 403);
    }
    return ctx.json({ message: 'Admin dashboard', data: { stats: { users: 2 } } });
});

// Protected resource
app.get('/profile', (ctx) => {
    if (!ctx.session.user) {
        return ctx.json({ error: 'Unauthorized' }, 401);
    }
    return ctx.json({ profile: ctx.session.user });
});

await app.listen();
console.log('Auth + Session App running on https://localhost:3103');
