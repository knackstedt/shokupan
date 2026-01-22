---
title: Middleware
description: Add cross-cutting concerns with middleware
---

Middleware functions have access to the request context and can control the request flow. They're perfect for cross-cutting concerns like logging, authentication, and error handling.

## Basic Middleware

Middleware receives the context and a `next` function:

```typescript
import { Middleware } from 'shokupan';

const logger: Middleware = async (ctx, next) => {
    console.log(`${ctx.method} ${ctx.path}`);
    const start = Date.now();
    
    await next();
    
    console.log(`${ctx.method} ${ctx.path} - ${Date.now() - start}ms`);
};

app.use(logger);
```

## Global Middleware

Apply middleware to all routes:

```typescript
// Logging
app.use(async (ctx, next) => {
    console.log(`→ ${ctx.method} ${ctx.path}`);
    await next();
});

// Request ID
app.use(async (ctx, next) => {
    ctx.state.requestId = crypto.randomUUID();
    await next();
});

// Add routes after middleware
app.get('/', (ctx) => {
    return { requestId: ctx.state.requestId };
});
```

## Route-Specific Middleware

Apply middleware to specific routes:

```typescript
const authenticate = async (ctx, next) => {
    const token = ctx.headers.get('authorization');
    
    if (!token) {
        return ctx.json({ error: 'Unauthorized' }, 401);
    }
    
    // Validate token and attach user
    ctx.state.user = { id: '123', name: 'Alice' };
    
    await next();
};

// Apply to single route
app.get('/protected', authenticate, (ctx) => {
    return { user: ctx.state.user };
});

// Apply to multiple handlers
app.post('/admin', 
    authenticate, 
    checkAdmin,
    (ctx) => {
        return { admin: true };
    }
);
```

## Router Middleware

Apply middleware to all routes in a router:

```typescript
import { ShokupanRouter } from 'shokupan';

const apiRouter = new ShokupanRouter();

// Middleware for all routes in this router
apiRouter.use(authenticate);

apiRouter.get('/users', (ctx) => ({ users: [] }));
apiRouter.get('/posts', (ctx) => ({ posts: [] }));

app.mount('/api', apiRouter);
```

## Controller Middleware

Use the `@Use` decorator for controllers:

```typescript
import { Use } from 'shokupan';

// On entire controller
@Use(authenticate)
export class AdminController {
    @Get('/dashboard')
    getDashboard() { }
}

// On specific methods
export class UserController {
    @Get('/')
    @Use(rateLimit)
    getUsers() { }
}
```

## Error Handling

Middleware can catch and handle errors:

```typescript
const errorHandler: Middleware = async (ctx, next) => {
    try {
        return await next();
    } catch (error) {
        console.error('Error:', error);
        
        return ctx.json({
            error: 'Internal Server Error',
            message: error.message
        }, 500);
    }
};

// Add early in middleware chain
app.use(errorHandler);
```

## Request Timing

Track request duration:

```typescript
const timing: Middleware = async (ctx, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    
    // Add timing header
    ctx.set('X-Response-Time', `${duration}ms`);
};

app.use(timing);
```

## Authentication

Create an authentication middleware:

```typescript
const authenticate: Middleware = async (ctx, next) => {
    const token = ctx.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return ctx.json({ error: 'No token provided' }, 401);
    }
    
    try {
        // Verify JWT token
        const user = await verifyToken(token);
        ctx.state.user = user;
        await next();
    } catch (error) {
        return ctx.json({ error: 'Invalid token' }, 401);
    }
};
```

## Request ID

Add unique request IDs:

```typescript
const requestId: Middleware = async (ctx, next) => {
    const id = crypto.randomUUID();
    ctx.state.requestId = id;
    ctx.set('X-Request-ID', id);
    await next();
};

app.use(requestId);

app.get('/', (ctx) => {
    console.log(`Request ID: ${ctx.state.requestId}`);
    return { requestId: ctx.state.requestId };
});
```

## CORS Headers

Simple CORS middleware (use [CORS plugin](/plugins/cors/) for production):

```typescript
const cors: Middleware = async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (ctx.method === 'OPTIONS') {
        return ctx.status(204);
    }
    
    await next();
};

app.use(cors);
```

## Conditional Middleware

Apply middleware conditionally:

```typescript
const conditionalAuth: Middleware = async (ctx, next) => {
    // Skip auth for public endpoints
    if (ctx.path.startsWith('/public')) {
        await next();
        return;
    }
    
    // Require auth for all other endpoints
    await authenticate(ctx, next);
};

app.use(conditionalAuth);
```

## Middleware Order

Middleware executes in the order it's added:

```typescript
// ✅ Correct order
app.use(errorHandler);  // 1. Error handling first
app.use(logger);        // 2. Logging
app.use(authenticate);  // 3. Authentication
app.use(rateLimit);     // 4. Rate limiting

// Routes
app.get('/', handler);

// Request flow:
// errorHandler → logger → authenticate → rateLimit → handler
// Response flow (reversed):
// handler → rateLimit → authenticate → logger → errorHandler
```

## Modifying Responses

Middleware can modify responses:

```typescript
const addHeaders: Middleware = async (ctx, next) => {
    await next();
    
    // Add custom headers to response
    ctx.set('X-Powered-By', 'Shokupan');
    ctx.set('X-Version', '1.0.0');
};

app.use(addHeaders);
```

## State Sharing

Use `ctx.state` to share data between middleware:

```typescript
const loadUser: Middleware = async (ctx, next) => {
    const userId = ctx.query.get('userId');
    if (userId) {
        ctx.state.user = await fetchUser(userId);
    }
    await next();
};

const checkPermissions: Middleware = async (ctx, next) => {
    if (!ctx.state.user?.isAdmin) {
        return ctx.json({ error: 'Forbidden' }, 403);
    }
    await next();
};

app.get('/admin', loadUser, checkPermissions, (ctx) => {
    return { user: ctx.state.user };
});
```

## Built-in Plugins

Shokupan provides many built-in middleware plugins:

```typescript
import { 
    Cors, 
    Compression, 
    RateLimit, 
    SecurityHeaders 
} from 'shokupan';

app.use(Cors());
app.use(Compression());
app.use(RateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(SecurityHeaders());
```

See the [Plugins](/plugins/cors/) section for more details.

## Next Steps

- [Context API](/core/context/) - Full context reference
- [CORS Plugin](/plugins/cors/) - Configure CORS
- [Rate Limiting](/plugins/rate-limiting/) - Prevent abuse
- [Authentication](/plugins/authentication/) - OAuth2 support
