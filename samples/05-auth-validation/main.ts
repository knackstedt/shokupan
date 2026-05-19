import { Session, Shokupan, validate } from 'shokupan';
import { z } from 'zod';

/**
 * Sample 5: Auth + Validation + Permissions
 *
 * Demonstrates request validation with Zod, session management,
 * and basic authentication patterns.
 */

const LoginSchema = z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6)
});

const CreatePostSchema = z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(5000),
    published: z.boolean().optional()
});

interface Post {
    id: number;
    title: string;
    content: string;
    published: boolean;
    author: string;
    createdAt: string;
}

const users = new Map<string, { password: string; role: string }>([
    ['admin', { password: 'admin123', role: 'admin' }],
    ['alice', { password: 'alice123', role: 'user' }]
]);

const posts: Post[] = [];
let nextPostId = 1;

const app = new Shokupan({
    port: 3005,
    development: true,
    enableOpenApiGen: true
});

// Session middleware
app.use(Session({
    secret: 'sample-session-secret-change-in-production'
}));

// Request logging
app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    console.log(`${ctx.request.method} ${ctx.request.url} - ${ctx.response.status} (${Date.now() - start}ms)`);
});

// Public routes
app.get('/health', (ctx) => {
    return ctx.json({ status: 'ok' });
});

app.get('/posts', (ctx) => {
    const published = posts.filter(p => p.published);
    return ctx.json({ data: published });
});

app.get('/posts/:id', (ctx) => {
    const post = posts.find(p => p.id === parseInt(ctx.params.id) && p.published);
    if (!post) {
        return ctx.json({ error: 'Post not found' }, 404);
    }
    return ctx.json({ data: post });
});

// Login endpoint with Zod validation
app.post('/auth/login', validate({ body: LoginSchema }), async (ctx) => {
    const body = await ctx.body();
    const user = users.get(body.username);

    if (!user || user.password !== body.password) {
        return ctx.json({ error: 'Invalid credentials' }, 401);
    }

    ctx.session.user = { username: body.username, role: user.role };

    return ctx.json({
        message: 'Logged in',
        user: { username: body.username, role: user.role }
    });
});

// Logout
app.post('/auth/logout', (ctx) => {
    delete ctx.session.user;
    return ctx.json({ message: 'Logged out' });
});

// Protected middleware
app.use('/admin/*', async (ctx, next) => {
    if (!ctx.session.user) {
        return ctx.json({ error: 'Unauthorized' }, 401);
    }
    if (ctx.session.user.role !== 'admin') {
        return ctx.json({ error: 'Forbidden' }, 403);
    }
    return next();
});

app.use('/posts', async (ctx, next) => {
    if (ctx.request.method !== 'GET' && !ctx.session.user) {
        return ctx.json({ error: 'Unauthorized' }, 401);
    }
    return next();
});

// Create post (requires auth + validation)
app.post('/posts', validate({ body: CreatePostSchema }), async (ctx) => {
    const body = await ctx.body();
    const post: Post = {
        id: nextPostId++,
        title: body.title,
        content: body.content,
        published: body.published ?? true,
        author: ctx.session.user?.username || 'anonymous',
        createdAt: new Date().toISOString()
    };
    posts.push(post);
    return ctx.json({ data: post }, 201);
});

// Admin: list all posts including unpublished
app.get('/admin/posts', (ctx) => {
    return ctx.json({ data: posts, total: posts.length });
});

// Admin: delete post
app.delete('/admin/posts/:id', (ctx) => {
    const id = parseInt(ctx.params.id);
    const index = posts.findIndex(p => p.id === id);
    if (index === -1) {
        return ctx.json({ error: 'Post not found' }, 404);
    }
    const deleted = posts.splice(index, 1)[0];
    return ctx.json({ data: deleted });
});

app.listen().then(() => {
    console.log('Auth + Validation App running on http://localhost:3005');
    console.log('Public: GET /posts, GET /posts/:id, POST /auth/login');
    console.log('Protected: POST /posts, GET/DELETE /admin/*');
    console.log('');
    console.log('Test login:');
    console.log('  curl -X POST http://localhost:3005/auth/login \\');
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -d \'{"username":"admin","password":"admin123"}\'');
});
