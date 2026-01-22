---
title: Routing
description: Learn about routing in Shokupan
---

Shokupan supports Express-style routing with a clean, intuitive API. Routes can be defined using HTTP method helpers or the generic `add()` method.

## Basic Routes

Define routes for different HTTP methods:

```typescript
import { Shokupan } from 'shokupan';

const app = new Shokupan();

// GET request
app.get('/users', (ctx) => {
    return { users: ['Alice', 'Bob'] };
});

// POST request
app.post('/users', async (ctx) => {
    const body = await ctx.body();
    return { created: body };
});

// PUT, PATCH, DELETE
app.put('/users/:id', (ctx) => ({ updated: ctx.params.id }));
app.patch('/users/:id', (ctx) => ({ patched: ctx.params.id }));
app.delete('/users/:id', (ctx) => ({ deleted: ctx.params.id }));

// HEAD, OPTIONS
app.head('/users', (ctx) => ctx.status(200));
app.options('/users', (ctx) => ctx.status(200));

// Match all HTTP methods
app.all('/webhook', (ctx) => ({method: ctx.method}));
```

## Path Parameters

Extract dynamic values from the URL path:

```typescript
// Single parameter
app.get('/users/:id', (ctx) => {
    const userId = ctx.params.id;
    return { id: userId, name: 'Alice' };
});

// Multiple parameters
app.get('/posts/:postId/comments/:commentId', (ctx) => {
    return {
        postId: ctx.params.postId,
        commentId: ctx.params.commentId
    };
});

// Optional segments with wildcards
app.get('/files/*', (ctx) => {
    // Matches /files/anything/here
    return { path: ctx.path };
});
```

## Query Strings

Access query parameters using the `query` property:

```typescript
app.get('/search', (ctx) => {
    const query = ctx.query.get('q');
    const page = ctx.query.get('page') || '1';
    const limit = ctx.query.get('limit') || '10';
    
    return {
        query,
        page: parseInt(page),
        limit: parseInt(limit),
        results: []
    };
});

// GET /search?q=shokupan&page=2&limit=20
```

## Routers

Group related routes using `ShokupanRouter`:

```typescript
import { ShokupanRouter } from 'shokupan';

const apiRouter = new ShokupanRouter();

apiRouter.get('/users', (ctx) => ({ users: [] }));
apiRouter.get('/posts', (ctx) => ({ posts: [] }));
apiRouter.get('/comments', (ctx) => ({ comments: [] }));

// Mount router under /api prefix
app.mount('/api', apiRouter);

// Available at:
// GET /api/users
// GET /api/posts
// GET /api/comments
```

### Nested Routers

Routers can be nested for better organization:

```typescript
const v1Router = new ShokupanRouter();
const v2Router = new ShokupanRouter();

v1Router.get('/users', (ctx) => ({ version: 1, users: [] }));
v2Router.get('/users', (ctx) => ({ version: 2, users: [] }));

app.mount('/api/v1', v1Router);
app.mount('/api/v2', v2Router);
```

## Route Handlers

Handlers receive a [context object](/api/context/) and can return various response types:

```typescript
// Return JSON (most common)
app.get('/json', (ctx) => {
    return { message: 'Hello' };
});

// Return text
app.get('/text', (ctx) => {
    return ctx.text('Hello, World!');
});

// Return HTML
app.get('/html', (ctx) => {
    return ctx.html('<h1>Hello</h1>');
});

// Return Response directly
app.get('/custom', (ctx) => {
    return new Response('Custom', {
        status: 200,
        headers: { 'X-Custom': 'value' }
    });
});

// Async handlers
app.get('/async', async (ctx) => {
    const data = await fetchFromDatabase();
    return { data };
});
```

## Multiple Handlers (Middleware Chain)

Pass multiple handlers to create a middleware chain:

```typescript
const authenticate = async (ctx, next) => {
    if (!ctx.headers.get('authorization')) {
        return ctx.json({ error: 'Unauthorized' }, 401);
    }
    await next();
};

const authorize = async (ctx, next) => {
    // Check permissions
    await next();
};

app.get('/protected', 
    authenticate,
    authorize,
    (ctx) => {
        return { secret: 'data' };
    }
);
```

## Route Groups

Apply middleware to multiple routes:

```typescript
const authRouter = new ShokupanRouter();

// This middleware applies to all routes in this router
authRouter.use(authenticate);

authRouter.get('/profile', (ctx) => ({ profile: {} }));
authRouter.get('/settings', (ctx) => ({ settings: {} }));
authRouter.post('/logout', (ctx) => ({ message: 'Logged out' }));

app.mount('/auth', authRouter);
```

## Route Order

Routes are matched in the order they are defined:

```typescript
// ✅ Specific route first
app.get('/users/me', (ctx) => {
    return { current: 'user' };
});

app.get('/users/:id', (ctx) => {
    return { id: ctx.params.id };
});

// ❌ Wrong order - /users/me would never match
app.get('/users/:id', (ctx) => {
    return { id: ctx.params.id };
});

app.get('/users/me', (ctx) => {
    return { current: 'user' };  // Never reached!
});
```

## OpenAPI Metadata

Add OpenAPI documentation to your routes:

```typescript
app.get('/users/:id', {
    summary: 'Get user by ID',
    description: 'Retrieves a single user',
    tags: ['Users'],
    parameters: [{
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' }
    }],
    responses: {
        200: {
            description: 'User found',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' }
                        }
                    }
                }
            }
        }
    }
}, (ctx) => {
    return { id: ctx.params.id, name: 'Alice' };
});
```

## Next Steps

- [Controllers](/core/controllers/) - Use decorators for organized routing
- [Middleware](/core/middleware/) - Add cross-cutting concerns
- [Context API](/api/context/) - Full context reference
