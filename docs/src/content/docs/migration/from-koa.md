---
title: Migrating from Koa
description: Guide to migrating from Koa to Shokupan
---

Shokupan's context-based approach is inspired by Koa. Migration is straightforward.

## Key Differences

1. **Return Value**: Shokupan requires returning the response from middleware
2. **Routing**: Built-in routing, no need for external router
3. **Body Parsing**: Built-in, no need for koa-bodyparser

## Middleware

**Koa:**
```typescript
app.use(async (ctx, next) => {
    await next();
});
```

**Shokupan:**
```typescript
app.use(async (ctx, next) => {
    const result = await next();
    return result;  // Must return!
});
```

## Next Steps

- [Core Concepts](/shokupan/core/routing/) - Learn Shokupan patterns
