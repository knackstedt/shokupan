import "./otel";

import { Compression } from '../plugins/compression';
import { Cors } from '../plugins/cors';
import { DebugDashboard } from '../plugins/debugview/plugin';
import { RateLimitMiddleware } from '../plugins/rate-limit';
import { ScalarPlugin } from '../plugins/scalar';
import { SecurityHeaders } from '../plugins/security-headers';
import { Session } from '../plugins/session';
import { Shokupan } from '../shokupan';
import { DecoratorTestController } from './controllers/decorator-controller';
import { UserController } from './controllers/implicit-controller';
import { appLevelHooks, HooksExampleRouter, PerRouteHooksRouter } from './routes/hooks-example';
import { JSXExampleRouter } from './routes/jsx-example';
import { ServiceFetchRouter } from './routes/service_fetch';
import { TrackingDemoRouter } from './routes/tracking';
import { AjvValidationRouter } from './routes/validators/validation-ajv';
import { ClassValidatorRouter } from './routes/validators/validation-class-validator';
import { TypeBoxValidationRouter } from './routes/validators/validation-typebox';
import { ValibotValidationRouter } from './routes/validators/validation-valibot';
import { ZodValidationRouter } from './routes/validators/validation-zod';

type session = {
    profile: any,
    lastAccess: Date;
};

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
 * - Static Files: Multiple mount points with directory listings
 * - Timeouts: Request, read, and write timeouts
 */

const dashboard = new DebugDashboard({
    getRequestHeaders: () => ({
        "Authorization": "Bearer my-secret-token"
    })
});

const app = new Shokupan<{
    session: session;
}>({
    port: 3000,
    development: true,
    enableOpenApiGen: true,

    // Timeout Configuration
    requestTimeout: 30000,  // 30 seconds
    readTimeout: 10000,     // 10 seconds

    // Enable AsyncLocalStorage for better request context tracking
    enableAsyncLocalStorage: true,

    // Enable Middleware Tracking for Demo
    enableMiddlewareTracking: true,

    // Event Hooks (app-level)
    hooks: [
        appLevelHooks,
        dashboard.getHooks()
    ],

});

// ============================================================================
// MIDDLEWARE PLUGINS
// ============================================================================

// CORS: Enable cross-origin requests
app.use(Cors({
    origin: '*', // In production, specify allowed origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    maxAge: 86400 // 24 hours
}));

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
}, (ctx) => {
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


// ============================================================================
// MOUNT FEATURE EXAMPLES
// ============================================================================

// Decorator-based controller
app.mount('/decorator_test', DecoratorTestController);

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
app.mount("/admin", dashboard);

// ============================================================================
// OPENAPI DOCUMENTATION
// ============================================================================

app.mount('/scalar', new ScalarPlugin({
    enableStaticAnalysis: true,
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
            url: 'http://localhost:3000',
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
    },
    config: {}
}));

// ============================================================================
// START SERVER
// ============================================================================

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                                 ║
║         🍞 Shokupan Comprehensive Example Server 🍞             ║
║                                                                 ║
╚═══════════════════════════════════════════════════════════════╝

🚀 Server starting with ALL features enabled:

📦 Middleware:
   ✓ CORS (cross-origin requests)
   ✓ Compression (gzip/brotli)
   ✓ Rate Limiting (100 req/min)
   ✓ Security Headers (XSS, CSRF protection)
   ✓ Session Management

✅ Validation Examples (5 libraries):
   • /validation/zod
   • /validation/typebox
   • /validation/ajv
   • /validation/valibot
   • /validation/class-validator

🎯 Feature Examples:
   • /decorators - Decorator-based controllers
   • /di - Dependency injection
   • /hooks - Event lifecycle hooks
   • /jsx - JSX rendering

📖 Documentation:
   • /scalar - Interactive API docs
   • / - API overview

⏱️  Timeouts:
   • Request: 30s
   • Read: 10s

🌐 Starting server...
`);

app.listen().then(() => {
    console.log(`
    🍞 Shokupan Comprehensive Example Server 🍞
    
    Access the debug dashboard at http://localhost:3000/admin
    `);
});