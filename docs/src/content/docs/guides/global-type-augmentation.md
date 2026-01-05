---
title: Global Type Augmentation
description: This guide shows how to use TypeScript's **module augmentation** to globally extend `ShokupanContext` types, similar to how `express-session` extends the Express `Request` type.
---

## Overview

By default, `ShokupanContext` uses generic types that must be explicitly provided:

```typescript
const app = new Shokupan<AppState>();
const router = new ShokupanRouter<AppState>();
```

However, for **decorator-based controllers**, there's no direct connection to the app instance, making it difficult to get type safety. Module augmentation solves this problem by **globally** extending the context types.

## Basic Module Augmentation

Create a TypeScript declaration file (e.g., `src/types/shokupan.d.ts`):

```typescript
import 'shokupan';

// Define your application state
interface MyAppState {
    userId: string;
    requestId: string;
    session: {
        id: string;
        data: Record<string, any>;
    };
}

// Augment the ShokupanContext module
declare module 'shokupan' {
    interface ShokupanContext {
        // Override the state property with your custom type
        state: MyAppState;
    }
}
```

**Important:** Your `tsconfig.json` must include this file:

```json
{
    "compilerOptions": {
        "types": ["./src/types/shokupan.d.ts"]
    },
    "include": ["src/**/*"]
}
```

## Using Augmented Types in Controllers

Once augmented, **all** decorator controllers automatically get typed `ctx.state`:

```typescript
import { Get, Post, Ctx, Body } from 'shokupan';
import { ShokupanContext } from 'shokupan';

export class UserController {
    @Get('/:id')
    async getUser(@Ctx() ctx: ShokupanContext) {
        // ✅ ctx.state is now typed as MyAppState
        const userId = ctx.state.userId;      // ✅ Type-safe!
        const sessionId = ctx.state.session.id; // ✅ Type-safe!
        
        return {
            userId,
            sessionId
        };
    }

    @Post('/create')
    async createUser(@Body() body: any, @Ctx() ctx: ShokupanContext) {
        // ✅ Full IntelliSense for state
        ctx.state.requestId; // ✅ Works!
        
        return ctx.json({ created: true });
    }
}
```

## Advanced: Extending Multiple Properties

You can augment other context properties as well:

```typescript
import 'shokupan';

interface CustomUser {
    id: string;
    email: string;
    role: 'admin' | 'user';
}

declare module 'shokupan' {
    interface ShokupanContext {
        // Custom state
        state: {
            user?: CustomUser;
            requestId: string;
            startTime: number;
        };
        
        // Add custom methods
        getCurrentUser(): CustomUser | undefined;
        
        // Add custom properties (e.g., from plugins)
        session: {
            get(key: string): any;
            set(key: string, value: any): void;
        };
    }
}
```

Then implement the methods in middleware:

```typescript
app.use(async (ctx, next) => {
    // Add the custom method
    (ctx as any).getCurrentUser = () => ctx.state.user;
    return next();
});
```

## Comparison: Augmentation vs. Generics

### Module Augmentation (Global)

**✅ Pros:**
- Works automatically in decorator controllers
- No need to pass generics everywhere
- Plugin-friendly (plugins can augment globally)
- Similar to Express/Koa patterns

**❌ Cons:**
- Global modification (affects all contexts)
- Less explicit
- Can be harder to track which middleware sets what

**Best for:** Decorator-based controllers, Express-style apps

### Generic Types (Explicit)

**✅ Pros:**
- Explicit and clear
- Type safety enforced at compile time
- Different routers can have different state types
- Better for large apps with multiple contexts

**❌ Cons:**
- Verbose (must specify generics)
- Doesn't work well with decorator controllers
- More boilerplate

**Best for:** Router-based architecture, type-strict apps

## Hybrid Approach (Recommended)

You can use **both** approaches:

```typescript
// Global augmentation for common properties
declare module 'shokupan' {
    interface ShokupanContext {
        state: {
            requestId: string;
            timestamp: number;
        };
    }
}

// Router-specific state extends the global
interface AdminState extends ShokupanContext['state'] {
    adminUser: {
        id: string;
        permissions: string[];
    };
}

class AdminRouter extends ShokupanRouter<AdminState> {
    constructor() {
        super();
        
        this.get('/dashboard', (ctx) => {
            // Has both requestId (global) AND adminUser (router-specific)
            ctx.state.requestId;    // ✅ From global augmentation
            ctx.state.adminUser;    // ✅ From AdminState generic
        });
    }
}
```

## Examples from Popular Libraries

This pattern is used by many TypeScript libraries:

### express-session
```typescript
declare module 'express-serve-static-core' {
    interface Request {
        session: Session & Partial<SessionData>;
    }
}
```

### passport
```typescript
declare module 'express-serve-static-core' {
    interface Request {
        user?: Express.User;
        login(user: Express.User, done: (err: any) => void): void;
        logout(): void;
    }
}
```

### Shokupan equivalent
```typescript
declare module 'shokupan' {
    interface ShokupanContext {
        user?: { id: string; email: string };
        login(user: any): Promise<void>;
        logout(): void;
    }
}
```

## Best Practices

1. **Keep augmentations in a dedicated file** (`src/types/shokupan.d.ts`)
2. **Document what each middleware adds** to the state
3. **Use optional properties** (`user?:`) when not all routes have them
4. **Combine with runtime checks** to ensure type safety matches runtime behavior
5. **Use interface merging** - you can have multiple `declare module 'shokupan'` blocks across files

## Troubleshooting

### Types not recognized?

Ensure your `tsconfig.json` includes the declaration file:

```json
{
    "include": ["src/**/*"],
    "compilerOptions": {
        "moduleResolution": "bundler",
        "types": ["bun-types"]
    }
}
```

### Conflicts with generic types?

Module augmentation takes precedence. If you use both, the augmented types will override generics for the `state` property.

### IDE not showing types?

1. Restart your TypeScript server (VS Code: `Cmd/Ctrl + Shift + P` → "Restart TS Server")
2. Ensure the `.d.ts` file is in your `include` paths
3. Check for syntax errors in your declaration file

## Complete Example

**src/types/shokupan.d.ts:**
```typescript
import 'shokupan';

declare module 'shokupan' {
    interface ShokupanContext {
        state: {
            requestId: string;
            userId?: string;
            session?: {
                id: string;
                data: Record<string, any>;
            };
        };
    }
}
```

**src/middleware/session.ts:**
```typescript
import { Middleware } from 'shokupan';

export const sessionMiddleware: Middleware = async (ctx, next) => {
    ctx.state.requestId = crypto.randomUUID();
    ctx.state.session = {
        id: 'session-' + Math.random(),
        data: {}
    };
    return next();
};
```

**src/controllers/user.controller.ts:**
```typescript
import { Get, Ctx } from 'shokupan';
import { ShokupanContext } from 'shokupan';

export class UserController {
    @Get('/profile')
    async getProfile(@Ctx() ctx: ShokupanContext) {
        // ✅ Full type safety without generics!
        const sessionId = ctx.state.session?.id;
        
        return {
            requestId: ctx.state.requestId,
            sessionId
        };
    }
}
```

**src/main.ts:**
```typescript
import { Shokupan } from 'shokupan';
import { sessionMiddleware } from './middleware/session';
import { UserController } from './controllers/user.controller';

const app = new Shokupan();

app.use(sessionMiddleware);
app.mount('/users', UserController);

app.listen();
```

## Conclusion

Module augmentation provides a clean way to achieve global type safety in Shokupan, especially for decorator-based controllers. It's a powerful TypeScript feature that makes your codebase more maintainable while preserving the familiar Express-style patterns.

For complex applications, consider the **hybrid approach** that combines global augmentation for common properties with router-specific generics for specialized state.
