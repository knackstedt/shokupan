---
title: Migrating from Express
description: Guide to migrating from Express.js to Shokupan
---

Shokupan is designed to feel familiar to Express developers. This guide shows you how to migrate your Express app.

## Key Differences

1. **Context vs Req/Res**: Single `ctx` object instead of separate `req` and `res`
2. **Return vs Send**: Return values directly instead of calling `res.json()`
3. **Built-in Parsing**: Body parsing is automatic
4. **Async by Default**: All handlers are naturally async
5. **Web Standards**: Uses `Headers`, `URL`, `Response` from web standards

## Basic Server

**Express:**
```typescript
import express from 'express';
const app = express();
app.get('/', (req, res) => {
    res.json({ message: 'Hello' });
});
app.listen(3000);
```

**Shokupan:**
```typescript
import { Shokupan } from 'shokupan';
const app = new Shokupan({ port: 3000 });
app.get('/', (ctx) => {
    return { message: 'Hello' };
});
app.listen();
```

## Middleware

**Express:**
```typescript
app.use((req, res, next) => {
    console.log(req.method, req.path);
    next();
});
```

**Shokupan:**
```typescript
app.use(async (ctx, next) => {
    console.log(ctx.method, ctx.path);
    return next();  // Must return!
});
```

## Migration Checklist

- [ ] Replace `req` and `res` with `ctx`
- [ ] Change `res.json()` to `return`
- [ ] Remove `express.json()` middleware
- [ ] Return values from middleware
- [ ] Update header access: `req.headers.key` → `ctx.headers.get('key')`
- [ ] Update query params: `req.query.key` → `ctx.query.get('key')`

## Next Steps

- [Routing](/shokupan/core/routing/) - Learn Shokupan patterns
- [Controllers](/shokupan/core/controllers/) - Use decorators
