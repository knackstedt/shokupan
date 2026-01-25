---
title: Sessions
description: Session management with connect-style store support
---

Shokupan provides session management compatible with connect/express-session stores.

## Basic Usage

```typescript
import { Shokupan, Session } from 'shokupan';

const app = new Shokupan();

app.use(Session({
    secret: 'your-secret-key'
}));

app.get('/login', (ctx) => {
    ctx.session.user = { id: '123', name: 'Alice' };
    return { message: 'Logged in' };
});

app.get('/profile', (ctx) => {
    if (!ctx.session.user) {
        return ctx.json({ error: 'Not authenticated' }, 401);
    }
    return ctx.session.user;
});

app.get('/logout', (ctx) => {
    ctx.session.destroy();
    return { message: 'Logged out' };
});

app.listen();
```

## Configuration

```typescript
app.use(Session({
    secret: 'your-secret-key',  // Required
    name: 'sessionId',          // Cookie name (default: 'connect.sid')
    resave: true,               // Resave session even if unmodified (default: true)
    saveUninitialized: true,    // Save new sessions (default: true)
    
    cookie: {
        httpOnly: true,
        secure: true,                 // HTTPS only
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
    }
}));
```


## External Stores (Redis, Database)
For production, you should use an external store like [SurrealDB](https://www.npmjs.com/package/connect-surreal) or Redis. The Session plugin is compatible with stores that follow the [connect](https://github.com/senchalabs/connect) store interface. You can find most compatible stores [here](https://github.com/expressjs/session?tab=readme-ov-file#compatible-session-stores).


### SurrealDB Example
Using `connect-surreal`:

```typescript
import { SurrealDBStore } from "connect-surreal"
import { Shokupan, Session } from "shokupan";

const app = new Shokupan();

app.use(Session({
  store: new SurrealDBStore({
    url: 'ws://localhost:8000',
    signinOpts: {
        username: 'root',
        password: 'root',
    },
    connectionOpts: {
        namespace: 'main',
        database: 'main',
    },
    // SurrealDB doesn't support record TTL, this option regularly deletes expired sessions.
    autoSweepExpired: true
  }),
  secret: "keyboard cat"
}))
```

### Redis Example

Using `connect-redis` and `ioredis`:

```typescript
import { RedisStore } from "connect-redis"
import { Redis } from "ioredis"
import { Shokupan, Session } from "shokupan";

const app = new Shokupan();

app.use(Session({
    store: new RedisStore({
        prefix: "myapp:",
        client: new Redis(),
    }),
  secret: "keyboard cat",
}));
```

:::tip[Security]
The session secret is essentially a digital "tamper-proof seal" for your user's session cookies.

Here is the layman's breakdown:

1. The Problem: If you just gave a user a cookie that said ID=123, a hacker could change their cookie to ID=124 to pretend to be someone else.
2. The Solution: When the server gives a user a cookie, it uses the Session Secret to mathematically "sign" that ID (like ID=123.Signature).
3. The Verification: When the user sends the cookie back, the server checks the signature. If a hacker changed 123 to 124, the signature wouldn't match anymore, and the server would know the cookie was faked and reject it.
:::


## Session Methods

The session methods (`regenerate`, `destroy`, `save`, `reload`) are callback-based.

### Set Data

```typescript
app.post('/cart/add', async (ctx) => {
    const { productId } = await ctx.body();
    
    if (!ctx.session.cart) {
        ctx.session.cart = [];
    }
    
    ctx.session.cart.push(productId);
    
    return { cart: ctx.session.cart };
});
```

### Get Data

```typescript
app.get('/cart', (ctx) => {
    return {
        cart: ctx.session.cart || []
    };
});
```

### Destroy Session

```typescript
app.post('/logout', (ctx) => {
    // Destroy session (callback-based, but fire-and-forget here)
    ctx.session.destroy((err) => {
        if (err) console.error('Session destroy error', err);
    });
    return { message: 'Logged out' };
});
```

### Regenerate Session

```typescript
app.post('/login', async (ctx) => {
    const { username, password } = await ctx.body();
    
    // Validate credentials
    const user = await validateUser(username, password);
    
    if (user) {
        // Regenerate session ID (security best practice)
        await new Promise<void>((resolve, reject) => {
             ctx.session.regenerate((err) => err ? reject(err) : resolve());
        });
        
        ctx.session.user = user;
        return { message: 'Logged in' };
    }
    
    return ctx.json({ error: 'Invalid credentials' }, 401);
});
```

## Common Patterns

### Authentication

```typescript
// Login
app.post('/login', async (ctx) => {
    const { email, password } = await ctx.body();
    
    const user = await authenticateUser(email, password);
    
    if (!user) {
        return ctx.json({ error: 'Invalid credentials' }, 401);
    }
    
    ctx.session.userId = user.id;
    ctx.session.email = user.email;
    
    return { user };
});

// Protected route
const requireAuth = async (ctx, next) => {
    if (!ctx.session.userId) {
        return ctx.json({ error: 'Unauthorized' }, 401);
    }
    
    ctx.state.user = await getUserById(ctx.session.userId);
    return next();
};

app.get('/profile', requireAuth, (ctx) => {
    return ctx.state.user;
});

// Logout
app.post('/logout', (ctx) => {
    ctx.session.destroy();
    return { message: 'Logged out' };
});
```

### Shopping Cart

```typescript
app.get('/cart', (ctx) => {
    return { items: ctx.session.cart || [] };
});

app.post('/cart', async (ctx) => {
    const { productId, quantity } = await ctx.body();
    
    if (!ctx.session.cart) {
        ctx.session.cart = [];
    }
    
    ctx.session.cart.push({ productId, quantity });
    
    return { cart: ctx.session.cart };
});
```

### Flash Messages

```typescript
app.post('/submit', async (ctx) => {
    // Process form
    
    ctx.session.flash = { 
        type: 'success', 
        message: 'Form submitted successfully' 
    };
    
    return ctx.redirect('/dashboard');
});

app.get('/dashboard', (ctx) => {
    const flash = ctx.session.flash;
    delete ctx.session.flash;  // Remove after reading
    
    return { flash };
});
```

## Security Best Practices

:::tip[Security]
- Use HTTPS in production
- Set `httpOnly: true` to prevent XSS
- Set `secure: true` in production
- Use strong session secrets
- Regenerate sessions after login
- Set appropriate expiration times
:::

```typescript
app.use(Session({
    secret: process.env.SESSION_SECRET!,  // Strong, random secret
    
    resave: false,
    saveUninitialized: false,
    
    cookie: {
        httpOnly: true,              // Prevent XSS
        secure: process.env.NODE_ENV === 'production',  // HTTPS only
        sameSite: 'strict',          // CSRF protection
        maxAge: 60 * 60 * 1000      // 1 hour
    }
}));
```

## TypeScript Types

Type your session data:

```typescript
import { ShokupanContext } from 'shokupan';

interface SessionData {
    userId?: string;
    email?: string;
    cart?: Array<{ productId: string; quantity: number }>;
}

declare module 'shokupan' {
    interface ShokupanContext {
        session: SessionData & {
            destroy: () => void;
            regenerate: () => Promise<void>;
        };
    }
}

// Now you have type safety
app.get('/profile', (ctx) => {
    const userId = ctx.session.userId;  // Typed as string | undefined
});
```

## Next Steps

- [Authentication](/plugins/authentication/) - OAuth2 support
- [Rate Limiting](/plugins/rate-limiting/) - Protect login endpoints
- [Security Headers](/plugins/security-headers/) - Add security headers
