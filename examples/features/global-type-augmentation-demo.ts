/**
 * Global Type Augmentation Example
 * 
 * This example demonstrates how to use TypeScript module augmentation
 * to globally extend ShokupanContext types, enabling type-safe state
 * access in decorator-based controllers without explicit generics.
 * 
 * This is similar to how express-session extends the Express Request type.
 */

// ============================================================================
// STEP 1: Create Type Augmentation (normally in a .d.ts file)
// ============================================================================

// For this demo, we'll augment inline. In a real app, put this in:
// src/types/shokupan.d.ts

declare module '../context' {
    interface ShokupanContext {
        // Override state with your custom type
        state: {
            requestId: string;
            timestamp: number;
            userId?: string;
            session?: {
                id: string;
                authenticated: boolean;
                data: Record<string, any>;
            };
            user?: {
                id: string;
                email: string;
                role: 'admin' | 'user';
            };
        };

        // Add custom helper methods
        isAuthenticated(): boolean;
        getCurrentUser(): { id: string; email: string; role: string; } | undefined;
    }
}

// ============================================================================
// STEP 2: Create Middleware that Populates State
// ============================================================================


// Request ID middleware
export const requestIdMiddleware: Middleware = async (ctx, next) => {
    ctx.state.requestId = crypto.randomUUID();
    ctx.state.timestamp = Date.now();
    return next();
};

// Session middleware
export const sessionMiddleware: Middleware = async (ctx, next) => {
    const sessionId = ctx.get('x-session-id') || 'session-' + Math.random();

    ctx.state.session = {
        id: sessionId,
        authenticated: false,
        data: {}
    };

    return next();
};

// Auth middleware
export const authMiddleware: Middleware = async (ctx, next) => {
    const authHeader = ctx.get('authorization');

    if (authHeader?.startsWith('Bearer ')) {
        // Simulate decoding JWT
        ctx.state.userId = 'user-123';
        ctx.state.user = {
            id: 'user-123',
            email: 'user@example.com',
            role: 'user'
        };
        if (ctx.state.session) {
            ctx.state.session.authenticated = true;
        }
    }

    // Add helper methods
    (ctx as any).isAuthenticated = () => ctx.state.session?.authenticated ?? false;
    (ctx as any).getCurrentUser = () => ctx.state.user;

    return next();
};

// ============================================================================
// STEP 3: Use in Decorator Controllers with Full Type Safety
// ============================================================================

import { ShokupanContext } from '../../src/context';
import { Body, Ctx, Delete, Get, Post } from '../decorators';

export class GloballyTypedController {

    // ✅ No generics needed! ctx.state is automatically typed
    @Get('/')
    getInfo(@Ctx() ctx: ShokupanContext) {
        // Full IntelliSense for all state properties
        return {
            requestId: ctx.state.requestId,      // ✅ Type-safe
            timestamp: ctx.state.timestamp,      // ✅ Type-safe
            sessionId: ctx.state.session?.id,    // ✅ Type-safe
            authenticated: ctx.isAuthenticated() // ✅ Custom method works!
        };
    }

    @Get('/profile')
    getProfile(@Ctx() ctx: ShokupanContext) {
        const user = ctx.getCurrentUser();

        if (!user) {
            return ctx.json({ error: 'Not authenticated' }, 401);
        }

        // ✅ user is fully typed
        return {
            id: user.id,
            email: user.email,
            role: user.role,
            sessionId: ctx.state.session?.id
        };
    }

    @Post('/update-profile')
    updateProfile(
        @Body() body: { email?: string; },
        @Ctx() ctx: ShokupanContext
    ) {
        if (!ctx.state.user) {
            return ctx.json({ error: 'Not authenticated' }, 401);
        }

        // ✅ All optional chaining is type-safe
        const currentEmail = ctx.state.user.email;
        const newEmail = body.email || currentEmail;

        return {
            message: 'Profile updated',
            userId: ctx.state.userId,
            email: newEmail,
            requestId: ctx.state.requestId
        };
    }

    @Get('/admin-only')
    adminOnly(@Ctx() ctx: ShokupanContext) {
        // ✅ Type-safe role checking
        if (ctx.state.user?.role !== 'admin') {
            return ctx.json({ error: 'Forbidden' }, 403);
        }

        return {
            message: 'Admin access granted',
            adminUser: ctx.state.user
        };
    }

    @Delete('/logout')
    logout(@Ctx() ctx: ShokupanContext) {
        // Clear session
        if (ctx.state.session) {
            ctx.state.session.authenticated = false;
        }
        ctx.state.userId = undefined;
        ctx.state.user = undefined;

        return {
            message: 'Logged out',
            requestId: ctx.state.requestId
        };
    }
}

// ============================================================================
// STEP 4: Set Up Application
// ============================================================================

import { Shokupan } from '../../src/shokupan';
import type { Middleware } from '../../src/util/types';

function createApp() {
    const app = new Shokupan();

    // Apply middleware in order
    app.use(requestIdMiddleware);
    app.use(sessionMiddleware);
    app.use(authMiddleware);

    // Mount controller - no generics needed!
    app.mount('/api', GloballyTypedController);

    // Also works with inline routes
    app.get('/inline-typed', (ctx) => {
        // ✅ ctx.state is typed here too!
        return {
            requestId: ctx.state.requestId,
            session: ctx.state.session
        };
    });

    return app;
}

// ============================================================================
// EXAMPLE OUTPUT
// ============================================================================

console.log('✅ Global Type Augmentation Demo');
console.log('');
console.log('Key Benefits:');
console.log('1. No generics needed in decorator controllers');
console.log('2. Full IntelliSense for ctx.state in ALL handlers');
console.log('3. Custom methods (isAuthenticated, getCurrentUser) are typed');
console.log('4. Works exactly like express-session type augmentation');
console.log('5. Cleaner, more maintainable code');
console.log('');
console.log('Compare:');
console.log('  ❌ Without augmentation: @Ctx() ctx: ShokupanContext<AppState>');
console.log('  ✅ With augmentation:    @Ctx() ctx: ShokupanContext');
console.log('');
console.log('Both have the same type safety, but augmentation is cleaner!');

export { createApp };
