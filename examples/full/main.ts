import "./otel";

Error.stackTraceLimit = 50;

import { ApiExplorerPlugin } from '../../src/plugins/application/api-explorer/plugin';
import { AsyncApiPlugin } from '../../src/plugins/application/asyncapi/plugin';
import { AuthPlugin } from '../../src/plugins/application/auth';
import { Dashboard } from '../../src/plugins/application/dashboard/plugin';
import { MCPServerPlugin } from '../../src/plugins/application/mcp-server/plugin';
import { ScalarPlugin } from '../../src/plugins/application/scalar';
import { WebAppPlugin } from '../../src/plugins/application/web-app/plugin';
import { Compression } from '../../src/plugins/middleware/compression';
import { RateLimitMiddleware } from '../../src/plugins/middleware/rate-limit';
import { SecurityHeaders } from '../../src/plugins/middleware/security-headers';
import { Session } from '../../src/plugins/middleware/session';
import { Shokupan } from '../../src/shokupan';
import { ShokupanWebsocketRouter } from '../../src/websocket';
import { DecoratorTestController } from './controllers/decorator-controller';
import { UserController } from './controllers/implicit-controller';
import { ChunkedResponseRouter } from './routes/chunked-response';
import { HealthRouter } from './routes/health';
import { appLevelHooks, HooksExampleRouter, PerRouteHooksRouter } from './routes/hooks-example';
import { JSXExampleRouter } from './routes/jsx-example';
import { NestedRouter } from './routes/nested_router';
import { ServiceFetchRouter } from './routes/service_fetch';
import { TrackingDemoRouter } from './routes/tracking';
import { AjvValidationRouter } from './routes/validators/validation-ajv';
import { ClassValidatorRouter } from './routes/validators/validation-class-validator';
import { TypeBoxValidationRouter } from './routes/validators/validation-typebox';
import { ValibotValidationRouter } from './routes/validators/validation-valibot';
import { ZodValidationRouter } from './routes/validators/validation-zod';

/**
 * Application State Interface
 * 
 * Defines the shape of ctx.state for all routes in this application.
 * This provides type safety when accessing state in middleware and handlers.
 */
interface AppState {
    session: {
        profile: any;
        lastAccess: Date;
    };
}

/**
 * Comprehensive Shokupan Example Application
 * 
 * This example demonstrates ALL features of Shokupan:
 * - Middleware: CORS, Compression, Rate Limiting, Security Headers, Session
 * - Validation: Zod, TypeBox, Ajv, Valibot, class-validator
 * - Decorators: @Get, @Post, @Body, @Query, @Param, etc.
 * - Dependency Injection: Services and constructor injection
 * - Event Hooks: All lifecycle hooks (onError, onRequestStart, etc.)
 * - JSX Rendering: Component-based HTML rendering
 * - OpenAPI: Automatic API documentation with Scalar
 * - AsyncAPI: Automatic API documentation with AsyncAPI
 * - Static Files: Multiple mount points with directory listings
 * - Timeouts: Request, read, and write timeouts
 */


// Create app with typed state for session management
const port = parseInt(process.env['PORT'] || '4220');
const app = new Shokupan<AppState>({
    port,
    development: true,
    enableOpenApiGen: true, // Enabled for verification

    // Timeout Configuration
    requestTimeout: 30000,  // 30 seconds
    readTimeout: 10000,     // 10 seconds

    // Enable AsyncLocalStorage for better request context tracking
    enableAsyncLocalStorage: true,

    enableAsyncApiGen: true,

    enableHttpBridge: true,

    // Enable Middleware Tracking for Demo
    enableMiddlewareTracking: true,

    // Enable WebSocket Visualization
    enableWebSocketTracking: true,

    // Event Hooks (app-level)
    hooks: [
        appLevelHooks
    ],

    surreal: {
        url: 'mem://'
    }
});

app.get("simple", (ctx) => {
    if (true) {
        ctx.json({ message: Date.now() });
    }
    else {
        ctx.json({ message: Date.now() });
    }

    ctx.json({ message: "Bad things happened here." });
});

// ============================================================================
// WEBSOCKET EVENT HANDLERS
// ============================================================================

// WebSocket router with event handlers for AsyncAPI documentation
const wsRouter = new ShokupanWebsocketRouter();

// Echo event - responds with the same data received
wsRouter.event("echo", async (ctx) => {
    const data = await ctx.body();
    ctx.emit("echo.response", data);
});

// Ping event - responds with pong
wsRouter.event("ping", (ctx) => {
    ctx.emit("pong", { timestamp: Date.now() });
});

// Chat message event
wsRouter.event("chat.message", async (ctx) => {
    const message = await ctx.body();
    ctx.emit("chat.broadcast", {
        message,
        timestamp: Date.now(),
        sender: "server"
    });
});

// Broadcast subscription
wsRouter.event("broadcast.subscribe", (ctx) => {
    ctx.emit("broadcast.subscribed", { 
        status: "subscribed",
        timestamp: Date.now()
    });
});

// Notification request
wsRouter.event("notification.request", async (ctx) => {
    const data = await ctx.body();
    ctx.emit("notification.response", {
        received: data,
        processed: true,
        timestamp: Date.now()
    });
});

// Mount WebSocket router
app.mount('/ws', wsRouter);

// ============================================================================
// TEST WEBSOCKET ENDPOINT (Raw handler for dashboard recording)
// ============================================================================

// Simple echo WebSocket for testing dashboard WS recording
app.socket("/ws/echo", (ctx) => {
    const success = ctx.upgrade({
        data: {
            handler: {
                open: (ws: any) => {
                    console.log('[WS/echo] Client connected');
                    ws.send(JSON.stringify({ type: 'welcome', message: 'Connected to echo server' }));
                },
                message: (ws: any, message: any) => {
                    console.log('[WS/echo] Received:', message);
                    ws.send(typeof message === 'string' ? message : JSON.stringify({ type: 'binary' }));
                },
                close: (ws: any, code: number) => {
                    console.log('[WS/echo] Client disconnected', code);
                }
            }
        }
    });
    if (!success) return ctx.text('WebSocket upgrade failed', 400);
});

// ============================================================================
// MIDDLEWARE PLUGINS
// ============================================================================

// CORS: Enable cross-origin requests
// app.use(Cors({
//     origin: '*', // In production, specify allowed origins
//     methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
//     credentials: true,
//     maxAge: 86400 // 24 hours
// }));

// Compression: Gzip/Brotli response compression
app.use(Compression({
    threshold: 1024 // Only compress responses > 1KB
}));

// Rate Limiting: Prevent abuse
// app.use(RateLimitMiddleware({
//     windowMs: 60 * 1000, // 1 minute
//     max: 100, // 100 requests per minute
//     message: { error: 'Too many requests, please try again later.' },
//     headers: true
// }));


// Security Headers: Set secure HTTP headers
app.use(SecurityHeaders({
    contentSecurityPolicy: false, // Disable for development (enable in production)
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'no-referrer' }
}));

// Session: User session management
app.use(Session({
    secret: process.env['SESSION_SECRET'] || 'dev-secret-change-in-production'
}));

// ============================================================================
// BASIC ROUTES
// ============================================================================

app.get("/", {
    summary: "API Root",
    description: "Welcome endpoint with links to all example sections"
}, (ctx, next) => {
    if (ctx.request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        return next();
    }
    return ctx.json({
        message: "🍞 Welcome to Shokupan Comprehensive Example",
        version: "1.0.0",
        documentation: "/scalar",
        sections: {
            validation: {
                zod: "/validation/zod",
                typebox: "/validation/typebox",
                ajv: "/validation/ajv",
                valibot: "/validation/valibot",
                classValidator: "/validation/class-validator"
            },
            features: {
                decorators: "/decorators",
                dependencyInjection: "/di",
                hooks: "/hooks",
                jsx: "/jsx"
            },
            existing: {
                user: "/api/user",
                serviceFetch: "/api/service_fetch",
                static: "/assets",
                images: "/images",
                files: "/files"
            }
        },
        middleware: [
            "CORS",
            "Compression",
            "Rate Limiting",
            "Security Headers",
            "Session Management"
        ],
        features: [
            "5 Validation Libraries",
            "Decorator-based Controllers",
            "Dependency Injection",
            "Event Lifecycle Hooks",
            "JSX Rendering",
            "OpenAPI Documentation",
            "Static File Serving",
            "Timeout Configuration"
        ]
    });
});

app.get("/implicit", ctx => {
    ctx.text("Implicit");
});

app.get("/multiResponse", ctx => {
    if (Math.random() > 0.5) {
        ctx.json({ payload: "version1" });
    } else {
        ctx.json({ message: "version2" });
    }
});



app.mount("/nested", NestedRouter);
app.register(new ScalarPlugin({ path: "/scalar" }));

// Health check endpoint
app.get("/health", {
    summary: "Health Check",
    description: "Server health status"
}, (ctx) => {
    return ctx.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ============================================================================
// STATIC FILE SERVING
// ============================================================================

app.static("/assets", {
    root: __dirname + "/static",
    listDirectory: true
});

app.static("/images", {
    root: __dirname + "/static/images",
    listDirectory: true
});

app.static("/files", {
    root: __dirname + "/static/files",
    listDirectory: true
});

// ============================================================================
// MOUNT VALIDATION EXAMPLES
// ============================================================================

app.mount('/validation/zod', new ZodValidationRouter());
app.mount('/validation/typebox', new TypeBoxValidationRouter());
app.mount('/validation/ajv', new AjvValidationRouter());
app.mount('/validation/valibot', new ValibotValidationRouter());
app.mount('/validation/class-validator', new ClassValidatorRouter());

app.use(RateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    max: 500, // 100 requests per minute
    message: { error: 'Too many requests, please try again later.' },
    headers: true
}));

app.get("/path/:param", ctx => {
    ctx.text(ctx.params.param);
});

// ============================================================================
// MOUNT FEATURE EXAMPLES
// ============================================================================

// Decorator-based controller
app.mount('/api/v1/decorator_test', DecoratorTestController);
app.mount('/api/v1/health', HealthRouter);

// Dependency Injection examples
// Note: DIExampleController and DIStatsRouter require full DI setup
// See di-example.ts for service implementation details
// app.mount('/di', DIExampleController);
// app.mount('/di/stats', new DIStatsRouter());

// Event Hooks examples
app.mount('/hooks', new HooksExampleRouter());
app.mount('/hooks/per-route', new PerRouteHooksRouter());

// JSX Rendering examples
app.mount('/jsx', new JSXExampleRouter());

// ============================================================================
// MOUNT EXISTING EXAMPLES
// ============================================================================

app.mount("/api/user", UserController);
app.mount("/api/service_fetch", ServiceFetchRouter);
app.mount("/api/tracking", new TrackingDemoRouter());
app.mount("/api/chunked", ChunkedResponseRouter);
await app.register(new Dashboard({
    path: "/dashboard"
}));
await app.register(new MCPServerPlugin({
    rootDir: './examples/full'
}));

await app.register(new AuthPlugin({
    jwtSecret: process.env['SESSION_SECRET'] || 'dev-secret-change-in-production',
    successRedirect: '/_app/',
    providers: {
        github: {
            clientId: process.env['GITHUB_CLIENT_ID'] || 'dummy-client-id',
            clientSecret: process.env['GITHUB_CLIENT_SECRET'] || 'dummy-client-secret',
            redirectUri: `https://localhost:${port}/auth/github/callback`
        },
        google: {
            clientId: process.env['GOOGLE_CLIENT_ID'] || 'dummy-client-id',
            clientSecret: process.env['GOOGLE_CLIENT_SECRET'] || 'dummy-client-secret',
            redirectUri: `http://localhost:${port}/auth/google/callback`
        },
        microsoft: {
            tenantId: process.env['MICROSOFT_TENANT_ID'] || 'common',
            clientId: process.env['MICROSOFT_CLIENT_ID'] || 'dummy-client-id',
            clientSecret: process.env['MICROSOFT_CLIENT_SECRET'] || 'dummy-client-secret',
            redirectUri: `http://localhost:${port}/auth/microsoft/callback`
        }
    },
    onSuccess: (user, ctx) => {
        // Automatically grant all permissions to the example user
        user.permissions = ["dashboard:read", "api-explorer:read", "asyncapi:read", "scalar:read"];
        // Return nothing so AuthPlugin proceeds to issue the session cookie and redirect
    }
}));

// ============================================================================
// OPENAPI DOCUMENTATION
// ============================================================================

app.mount('/openapi', new ApiExplorerPlugin({
    baseDocument: {
        info: {
            title: 'Shokupan Comprehensive Example API',
            version: '1.0.0',
            description: `
# Shokupan Example API

This API demonstrates all features of the Shokupan web framework.

## Features

- **5 Validation Libraries**: Zod, TypeBox, Ajv, Valibot, class-validator
- **Decorator Support**: Route and parameter decorators
- **Dependency Injection**: Injectable services with constructor injection
- **Event Hooks**: Complete lifecycle hook system
- **JSX Rendering**: Component-based HTML rendering
- **Middleware**: CORS, Compression, Rate Limiting, Security Headers, Sessions
- **OpenAPI**: Automatic API documentation generation

## Getting Started

Explore the different sections to see examples of each feature.
            `.trim()
        },
        servers: [{
            url: `http://localhost:${port}`,
            description: 'Local Development Server'
        }],
        tags: [
            { name: 'Validation', description: 'Validation examples using different libraries' },
            { name: 'Zod', description: 'Zod validation examples' },
            { name: 'TypeBox', description: 'TypeBox validation examples' },
            { name: 'Ajv', description: 'Ajv validation examples' },
            { name: 'Valibot', description: 'Valibot validation examples' },
            { name: 'class-validator', description: 'class-validator examples' },
            { name: 'Decorators', description: 'Decorator-based routing examples' },
            { name: 'DI', description: 'Dependency injection examples' },
            { name: 'Hooks', description: 'Event lifecycle hooks examples' },
            { name: 'JSX', description: 'JSX rendering examples' }
        ]
    }
}));

app.register(new AsyncApiPlugin({ path: "/asyncapi" }));
app.register(new WebAppPlugin({ path: '/_app' }));


console.log('--- Checking Middleware Stack before Listen ---');
app.middleware.forEach((m: any, i) => {
    console.log(`MW[${i}]: ${typeof m} ${m.constructor?.name} ${m.name}`);
});
console.log('-----------------------------------------------');

app.listen().then(() => {
    console.log(`
Shokupan Example Server is listening on http://localhost:${port}

Access the debug dashboard at http://localhost:${port}/admin
Access the OpenAPI docs at http://localhost:${port}/openapi
Access the Websocket playground at http://localhost:${port}/asyncapi
`);
});