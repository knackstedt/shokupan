---
title: Error Handling
description: Handle errors gracefully in Shokupan applications
---

Shokupan provides multiple mechanisms for handling errors, from automatic async error catching to custom error hooks and middleware.

## Automatic Error Catching

Unlike Express, Shokupan automatically catches errors in async handlers and middleware. You never need manual `try/catch` wrappers.

```typescript
// This will NOT crash the server — errors are caught automatically
app.get('/users/:id', async (ctx) => {
    const user = await fetchUser(ctx.params.id); // throws if not found
    return user;
});
```

Uncaught errors are caught by the framework and passed through the error handling pipeline.

## Error Hooks

Use `onError` hooks for global error handling:

```typescript
const app = new Shokupan({
    hooks: [{
        onError: (ctx, error) => {
            console.error('Request failed:', error);
            return ctx.json({ 
                error: 'Something went wrong',
                requestId: ctx.state.requestId 
            }, 500);
        }
    }]
});
```

You can also attach error hooks to individual routers:

```typescript
const apiRouter = new ShokupanRouter();

apiRouter.onError((ctx, error) => {
    return ctx.json({ 
        error: 'API Error',
        message: error.message 
    }, 500);
});
```

## Error Middleware

Use Koa-style error middleware for centralized handling:

```typescript
app.use(async (ctx, next) => {
    try {
        await next();
    } catch (error) {
        // Log the error
        ctx.app.logger?.error('Request Error', error);
        
        // Return custom response
        return ctx.json({ 
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'development' 
                ? error.message 
                : 'An error occurred'
        }, 500);
    }
});
```

## Custom Error Classes

Throw typed errors for different HTTP status codes:

```typescript
import { HttpError } from 'shokupan';

// Built-in HTTP errors
app.get('/users/:id', async (ctx) => {
    const user = await db.users.find(ctx.params.id);
    
    if (!user) {
        throw new HttpError('User not found', 404);
    }
    
    return user;
});

// Custom error classes
class ValidationError extends Error {
    status = 400;
    constructor(message: string) {
        super(message);
    }
}

app.post('/users', async (ctx) => {
    const body = await ctx.body();
    
    if (!body.email?.includes('@')) {
        throw new ValidationError('Invalid email address');
    }
    
    return { created: true };
});
```

## Validation Errors

The `validate` middleware automatically returns structured 400 responses:

```typescript
import { validate } from 'shokupan';
import { z } from 'zod';

const schema = z.object({
    email: z.string().email(),
    age: z.number().min(18)
});

app.post('/users', validate({ body: schema }), async (ctx) => {
    const body = await ctx.body(); // Already validated
    return { created: body };
});

// POST /users with { "email": "bad", "age": 10 }
// Response: 400 Bad Request
// {
//   "error": "Validation Error",
//   "errors": [ ... ]
// }
```

## Development vs Production

In development mode, Shokupan shows detailed error pages with stack traces. In production, errors are sanitized:

```typescript
const app = new Shokupan({
    development: process.env.NODE_ENV !== 'production'
});
```

- **Development**: Beautiful HTML error page with stack trace, request details, and source context
- **Production**: Generic error response without sensitive details

## Common Patterns

### Centralized Error Logger

```typescript
app.use(async (ctx, next) => {
    try {
        await next();
    } catch (error) {
        // Send to error tracking service
        await errorTracker.capture(error, {
            requestId: ctx.state.requestId,
            path: ctx.path,
            user: ctx.state.user?.id
        });
        
        throw error; // Re-throw for framework handling
    }
});
```

### Not Found Handler

```typescript
app.get('/*', (ctx) => {
    return ctx.json({ error: 'Not Found' }, 404);
});
```

### Graceful Degradation

```typescript
app.get('/dashboard', async (ctx) => {
    let notifications = [];
    
    try {
        notifications = await fetchNotifications(ctx.state.user);
    } catch (error) {
        // Log but don't fail the request
        ctx.app.logger?.warn('Notifications unavailable', error);
    }
    
    return { 
        user: ctx.state.user,
        notifications // empty array on failure
    };
});
```

## Next Steps

- [Testing](/guides/testing/) — Test error scenarios
- [Production](/guides/production/) — Error handling in production
