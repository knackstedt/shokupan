import { ShokupanRouter } from '../../src/router';
import { Shokupan } from '../../src/shokupan';
import { EmptyState, getStateProperty, hasStateProperty, requireStateProperty } from '../../src/util/types';

/**
 * Complete guide to state typing in Shokupan with all available approaches
 */

// ============================================================================
// APPROACH 1: Default (Permissive) - For Quick Prototyping
// ============================================================================

const simpleApp = new Shokupan();

simpleApp.use(async (ctx, next) => {
    // No type safety - anything goes
    ctx.state.anything = "anything";
    ctx.state.count = 42;
    return next();
});

simpleApp.get('/simple', (ctx) => {
    // Works, but no IntelliSense
    return ctx.json({ data: ctx.state.anything });
});

// ============================================================================
// APPROACH 2: Generic Types - For Type-Safe Applications
// ============================================================================

interface AppState {
    userId: string;
    requestId: string;
    permissions: string[];
}

const typedApp = new Shokupan<AppState>();

typedApp.use(async (ctx, next) => {
    // ✅ Type-safe assignments
    ctx.state.userId = 'user-123';
    ctx.state.requestId = crypto.randomUUID();
    ctx.state.permissions = ['read', 'write'];

    // ❌ TypeScript error:
    // ctx.state.nonExistent = 'error';

    return next();
});

typedApp.get('/profile', (ctx) => {
    // ✅ Full IntelliSense
    const { userId, permissions } = ctx.state;
    return ctx.json({ userId, permissions });
});

// ============================================================================
// APPROACH 3: EmptyState - For Apps Without State
// ============================================================================

const statelessApp = new Shokupan<EmptyState>();

statelessApp.get('/ping', (ctx) => {
    // ❌ TypeScript error: Can't set properties
    // ctx.state.anything = 'error';

    // ✅ Can still use context normally
    return ctx.json({ status: 'ok' });
});

// ============================================================================
// APPROACH 4: Optional State Properties - For Conditional Middleware
// ============================================================================

interface FlexibleState {
    // Always set
    requestId: string;
    timestamp: number;

    // Conditionally set
    userId?: string;
    session?: {
        id: string;
        data: Record<string, any>;
    };
}

const flexibleApp = new Shokupan<FlexibleState>();

// Base middleware - always runs
flexibleApp.use(async (ctx, next) => {
    ctx.state.requestId = crypto.randomUUID();
    ctx.state.timestamp = Date.now();
    return next();
});

// Auth middleware - conditionally runs
flexibleApp.use(async (ctx, next) => {
    const authHeader = ctx.get('authorization');
    if (authHeader) {
        ctx.state.userId = 'user-from-token';
        ctx.state.session = {
            id: 'session-123',
            data: {}
        };
    }
    return next();
});

// Route with type guards
flexibleApp.get('/data', (ctx) => {
    // OPTION 1: Using type guards
    if (hasStateProperty(ctx.state, 'userId')) {
        return ctx.json({
            message: 'Authenticated',
            userId: ctx.state.userId // TypeScript knows this exists
        });
    }

    return ctx.json({ message: 'Anonymous' });
});

// Route with getters
flexibleApp.get('/safe', (ctx) => {
    // OPTION 2: Using getStateProperty with defaults
    const userId = getStateProperty(ctx.state, 'userId', 'anonymous');
    const sessionId = ctx.state.session?.id || 'no-session';

    return ctx.json({ userId, sessionId });
});

// Route with assertions
flexibleApp.get('/protected', (ctx) => {
    // OPTION 3: Using requireStateProperty
    try {
        requireStateProperty(ctx.state, 'userId', 'Authentication required');

        // TypeScript now knows userId exists and is not null/undefined
        const userId: string = ctx.state.userId;

        return ctx.json({ userId });
    } catch (error: any) {
        return ctx.json({ error: error.message }, 401);
    }
});

// ============================================================================
// APPROACH 5: Router-Specific Types - For Modular Apps
// ============================================================================

interface AdminState {
    userId: string;
    adminRole: 'super' | 'admin' | 'moderator';
    permissions: string[];
}

class AdminRouter extends ShokupanRouter<AdminState> {
    constructor() {
        super();

        // Router middleware has typed state
        this.use(async (ctx, next) => {
            // These would typically come from auth middleware
            ctx.state.userId = 'admin-user';
            ctx.state.adminRole = 'admin';
            ctx.state.permissions = ['read', 'write', 'delete'];
            return next();
        });

        this.get('/dashboard', (ctx) => {
            // Full type safety within this router
            const { adminRole, permissions } = ctx.state;

            return ctx.json({
                role: adminRole,
                canDelete: permissions.includes('delete')
            });
        });
    }
}

const modularApp = new Shokupan();
modularApp.mount('/admin', new AdminRouter());

// ============================================================================
// APPROACH 6: Hybrid - Base State + Router Extensions
// ============================================================================

interface BaseState {
    requestId: string;
    timestamp: number;
}

interface ExtendedState extends BaseState {
    userId: string;
    role: string;
}

const hybridApp = new Shokupan<BaseState>();

// Base middleware sets common state
hybridApp.use(async (ctx, next) => {
    ctx.state.requestId = crypto.randomUUID();
    ctx.state.timestamp = Date.now();
    return next();
});

// Create router with extended state
class UserRouter extends ShokupanRouter<ExtendedState> {
    constructor() {
        super();

        this.use(async (ctx, next) => {
            // Has both base and extended state
            ctx.state.userId = 'user-123';
            ctx.state.role = 'user';
            return next();
        });

        this.get('/me', (ctx) => {
            // Can access both base and extended properties
            return ctx.json({
                requestId: ctx.state.requestId,
                userId: ctx.state.userId,
                role: ctx.state.role
            });
        });
    }
}

// Note: There's a type mismatch here between base and extended state
// In production, you'd want to use a common base or handle this differently
// hybridApp.mount('/users', new UserRouter());

// ============================================================================
// UTILITY FUNCTIONS - Helper Patterns
// ============================================================================

/**
 * Custom assertion for specific state requirements
 */
function requireAuthentication<T extends { userId?: string; }>(
    state: T
): asserts state is T & { userId: string; } {
    if (!state.userId) {
        throw new Error('Authentication required');
    }
}

/**
 * Type guard for admin role
 */
function isAdmin<T extends { role?: string; }>(
    state: T
): state is T & { role: 'admin' | 'super'; } {
    return state.role === 'admin' || state.role === 'super';
}

// Usage in routes
flexibleApp.get('/admin-only', (ctx) => {
    try {
        requireAuthentication(ctx.state);

        // Now TypeScript knows userId exists
        const userId: string = ctx.state.userId;

        if (isAdmin(ctx.state)) {
            return ctx.json({ message: 'Admin access granted' });
        }

        return ctx.json({ error: 'Forbidden' }, 403);
    } catch (error: any) {
        return ctx.json({ error: error.message }, 401);
    }
});

// ============================================================================
// Best Practices Summary
// ============================================================================

console.log(`
✅ State Typing Best Practices:

1. **Quick Prototyping**: Use default Shokupan() for flexibility
2. **Type Safety**: Use Shokupan<YourState>() for production apps
3. **No State**: Use Shokupan<EmptyState>() when you don't need state
4. **Optional Props**: Use interface with '?' for conditional middleware
5. **Type Guards**: Use hasStateProperty() for safe optional access
6. **Assertions**: Use requireStateProperty() to enforce required properties
7. **Defaults**: Use getStateProperty() with fallback values
8. **Modular**: Use ShokupanRouter<T> for router-specific state
9. **Hybrid**: Extend base state interfaces for common + specific props
10. **Custom Guards**: Create domain-specific type guards and assertions

📚 Choose the approach that matches your app's complexity:
- Simple API → Default or EmptyState
- Medium complexity → Generic types with optional properties
- Large/modular → Router-specific types with extensions
- Enterprise → Hybrid approach with shared base state
`);

export {
    flexibleApp,
    modularApp, simpleApp, statelessApp, typedApp
};

