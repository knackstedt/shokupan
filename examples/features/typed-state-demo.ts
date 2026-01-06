import { ShokupanRouter } from '../../src/router';
import { Shokupan } from '../../src/shokupan';

/**
 * This example demonstrates how to use TypeScript generics to type ctx.state
 * for type-safe state management across your application.
 */

// ============================================================================
// EXAMPLE 1: Basic App-Level State Typing
// ============================================================================

interface AppState {
    userId: string;
    tenant: string;
    requestId: string;
    startTime: number;
}

const app = new Shokupan<AppState>();

// Middleware can safely set state properties
app.use(async (ctx, next) => {
    ctx.state.requestId = crypto.randomUUID();
    ctx.state.startTime = Date.now();
    return next();
});

// Authentication middleware
app.use(async (ctx, next) => {
    // Simulated auth - in real app, decode JWT or session
    ctx.state.userId = 'user-123';
    ctx.state.tenant = 'tenant-abc';
    return next();
});

// Route handlers have fully typed state access
app.get('/profile', (ctx) => {
    // TypeScript knows all these properties exist!
    const { userId, tenant, requestId } = ctx.state;

    return ctx.json({
        userId,
        tenant,
        requestId,
        message: 'Profile data from typed state'
    });
});

// ============================================================================
// EXAMPLE 2: Router-Level State Typing
// ============================================================================

interface SessionState {
    sessionId: string;
    isAuthenticated: boolean;
    user?: {
        id: string;
        email: string;
        role: 'admin' | 'user';
    };
}

class AuthRouter extends ShokupanRouter<SessionState> {
    constructor() {
        super();

        // Router middleware has typed state
        this.use(async (ctx, next) => {
            ctx.state.sessionId = ctx.get('x-session-id') || 'no-session';
            ctx.state.isAuthenticated = false;
            return next();
        });

        this.post('/login', async (ctx) => {
            const body = await ctx.body();

            // Simulate authentication
            ctx.state.isAuthenticated = true;
            ctx.state.user = {
                id: 'user-456',
                email: body.email,
                role: 'user'
            };

            return ctx.json({
                success: true,
                sessionId: ctx.state.sessionId
            });
        });

        this.get('/me', (ctx) => {
            if (!ctx.state.isAuthenticated) {
                return ctx.json({ error: 'Not authenticated' }, 401);
            }

            // TypeScript knows user exists when isAuthenticated is true
            return ctx.json({
                user: ctx.state.user,
                sessionId: ctx.state.sessionId
            });
        });
    }
}

// ============================================================================
// EXAMPLE 3: Combining Path Params and State Typing
// ============================================================================

interface RequestState {
    userId: string;
    permissions: string[];
}

const app2 = new Shokupan<RequestState>();

app2.use(async (ctx, next) => {
    // Load user permissions based on auth
    ctx.state.userId = 'current-user';
    ctx.state.permissions = ['read', 'write'];
    return next();
});

// Both params AND state are fully typed!
app2.get('/users/:userId/posts/:postId', (ctx) => {
    // Path params are typed (from previous conversation)
    const { userId, postId } = ctx.params;

    // State is typed
    const { permissions } = ctx.state;

    if (!permissions.includes('read')) {
        return ctx.json({ error: 'Insufficient permissions' }, 403);
    }

    return ctx.json({
        userId,
        postId,
        requester: ctx.state.userId,
        permissions
    });
});

// ============================================================================
// EXAMPLE 4: Empty State (No State Management)
// ============================================================================

// For apps that don't use ctx.state, you can use the default type
const simpleApp = new Shokupan();

simpleApp.get('/hello', (ctx) => {
    // ctx.state is Record<string, any> by default
    // You can still use it, but without type safety
    return ctx.json({ message: 'Hello' });
});

// ============================================================================
// EXAMPLE 5: Helper Types for Common Patterns
// ============================================================================

// Define reusable state interfaces
interface BaseState {
    requestId: string;
    timestamp: number;
}

interface AuthenticatedState extends BaseState {
    userId: string;
    role: 'admin' | 'user' | 'guest';
}

interface TenantState extends AuthenticatedState {
    tenantId: string;
    tenantName: string;
}

// Use the most specific state type for your app
const multiTenantApp = new Shokupan<TenantState>();

multiTenantApp.use(async (ctx, next) => {
    ctx.state.requestId = crypto.randomUUID();
    ctx.state.timestamp = Date.now();
    ctx.state.userId = 'user-789';
    ctx.state.role = 'admin';
    ctx.state.tenantId = 'tenant-xyz';
    ctx.state.tenantName = 'Acme Corp';
    return next();
});

multiTenantApp.get('/tenant/info', (ctx) => {
    // All properties are typed!
    return ctx.json({
        tenant: {
            id: ctx.state.tenantId,
            name: ctx.state.tenantName
        },
        user: {
            id: ctx.state.userId,
            role: ctx.state.role
        },
        request: {
            id: ctx.state.requestId,
            timestamp: ctx.state.timestamp
        }
    });
});

// ============================================================================
// EXAMPLE 6: State with Optional Properties
// ============================================================================

interface FlexibleState {
    // Required properties
    requestId: string;

    // Optional properties (set by specific middleware)
    userId?: string;
    session?: {
        id: string;
        data: Record<string, any>;
    };
    cache?: Map<string, any>;
}

const flexibleApp = new Shokupan<FlexibleState>();

flexibleApp.use(async (ctx, next) => {
    // Always set required properties
    ctx.state.requestId = crypto.randomUUID();
    return next();
});

// Conditional middleware
flexibleApp.use(async (ctx, next) => {
    const authHeader = ctx.get('authorization');
    if (authHeader) {
        ctx.state.userId = 'authenticated-user';
    }
    return next();
});

flexibleApp.get('/data', (ctx) => {
    // TypeScript knows userId might be undefined
    if (ctx.state.userId) {
        return ctx.json({ message: 'Authenticated', userId: ctx.state.userId });
    } else {
        return ctx.json({ message: 'Anonymous' });
    }
});

console.log('✅ State typing examples created successfully!');
console.log('');
console.log('Key Takeaways:');
console.log('1. Use generics on Shokupan<State> for app-level state typing');
console.log('2. Use generics on ShokupanRouter<State> for router-level state typing');
console.log('3. Combine with path parameter typing for full type safety');
console.log('4. Use interface extension for reusable state patterns');
console.log('5. Use optional properties for conditional state');
