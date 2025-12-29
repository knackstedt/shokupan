# Shokupan 🍞

> A low-lift modern web framework for Bun

Shokupan is a high-performance, feature-rich web framework built specifically for Bun. It combines the familiarity of Express.js with modern NestJS-style architecture (Dependency Injection, Controllers) and seamless compatibility with the vast ecosystem of Express plugins — all while maintaining exceptional performance and built-in OpenAPI support.

### Note: Shokupan is still in alpha and is not guaranteed to be stable. Please use with caution. We will be adding more features and APIs in the future. Please file an issue if you find any bugs or have suggestions for improvement.

## ✨ Features

- 🚀 **Built for Bun** - Native [Bun](https://bun.sh/) performance with optimized routing
- 🎯 **TypeScript First** - Full type safety with decorators and generics
- 📝 **Auto OpenAPI** - Generate [OpenAPI](https://www.openapis.org/) specs automatically from routes
- 🔌 **Rich Plugin System** - CORS, Sessions, Auth, Validation, Rate Limiting, and more
- 🌐 **Flexible Routing** - Express-style routes or decorator-based controllers
- 🔀 **Express Compatible** - Works with [Express](https://expressjs.com/) middleware patterns
- 📊 **Built-in Telemetry** - [OpenTelemetry](https://opentelemetry.io/) instrumentation out of the box
- 🔐 **OAuth2 Support** - GitHub, Google, Microsoft, Apple, Auth0, Okta
- ✅ **Multi-validator Support** - Zod, Ajv, TypeBox, Valibot
- 📚 **OpenAPI Docs** - Beautiful OpenAPI documentation with [Scalar](https://scalar.dev/)
- ⏩ **Short shift** - Very simple migration from [Express](https://expressjs.com/) or [NestJS](https://nestjs.com/) to Shokupan

## 📦 Installation

```bash
bun add shokupan
```

## 🚀 Quick Start

```typescript
import { Shokupan } from 'shokupan';

const app = new Shokupan({
    port: 3000,
    development: true
});

app.get('/', (ctx) => {
    return { message: 'Hello, World!' };
});

app.listen();
```

That's it! Your server is running at `http://localhost:3000` 🎉

## 📖 Table of Contents

- [Core Concepts](#core-concepts)
  - [Routing](#routing)
  - [Controllers](#controllers)
  - [Middleware](#middleware)
  - [Context](#context)
  - [Static Files](#static-files)
- [Plugins](#plugins)
  - [CORS](#cors)
  - [Compression](#compression)
  - [Rate Limiting](#rate-limiting)
  - [Security Headers](#security-headers)
  - [Sessions](#sessions)
  - [Authentication](#authentication)
  - [Validation](#validation)
  - [Scalar (OpenAPI)](#scalar-openapi)
- [Advanced Features](#advanced-features)
  - [Dependency Injection](#dependency-injection)
  - [OpenAPI Generation](#openapi-generation)
  - [Sub-Requests](#sub-requests)
  - [OpenTelemetry](#opentelemetry)
- [Migration Guides](#migration-guides)
  - [From Express](#from-express)
  - [From Koa](#from-koa)
  - [From NestJS](#from-nestjs)
  - [Using Express Middleware](#using-express-middleware)
- [Testing](#testing)
- [Deployment](#deployment)
- [CLI Tools](#cli-tools)
- [API Reference](#api-reference)
- [Roadmap](#-roadmap)

## Core Concepts

### Routing

Shokupan supports Express-style routing with a clean, intuitive API:

#### Basic Routes

```typescript
import { Shokupan } from 'shokupan';

const app = new Shokupan();

// GET request
app.get('/users', (ctx) => {
    return { users: ['Alice', 'Bob'] };
});

// POST request
app.post('/users', async (ctx) => {
    const body = await ctx.body();
    return { created: body };
});

// PUT, PATCH, DELETE
app.put('/users/:id', (ctx) => ({ updated: ctx.params.id }));
app.patch('/users/:id', (ctx) => ({ patched: ctx.params.id }));
app.delete('/users/:id', (ctx) => ({ deleted: ctx.params.id }));

app.listen();
```

#### Path Parameters

```typescript
app.get('/users/:id', (ctx) => {
    const userId = ctx.params.id;
    return { id: userId, name: 'Alice' };
});

app.get('/posts/:postId/comments/:commentId', (ctx) => {
    return {
        postId: ctx.params.postId,
        commentId: ctx.params.commentId
    };
});
```

#### Query Strings

```typescript
app.get('/search', (ctx) => {
    const query = ctx.query.get('q');
    const page = ctx.query.get('page') || '1';
    
    return {
        query,
        page: parseInt(page),
        results: []
    };
});

// GET /search?q=shokupan&page=2
```

#### Routers

```typescript
import { ShokupanRouter } from 'shokupan';

const apiRouter = new ShokupanRouter();

apiRouter.get('/users', (ctx) => ({ users: [] }));
apiRouter.get('/posts', (ctx) => ({ posts: [] }));

// Mount router under /api prefix
app.mount('/api', apiRouter);

// Available at:
// GET /api/users
// GET /api/posts
```

### Controllers

Use decorators for a more structured, class-based approach:

<!-- @Controller('/users') -->
```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, Query } from 'shokupan';

export class UserController {
    
    @Get('/')
    async getUsers(@Query('role') role?: string) {
        return {
            users: ['Alice', 'Bob'],
            filter: role || 'all'
        };
    }
    
    @Get('/:id')
    async getUserById(@Param('id') id: string) {
        return {
            id,
            name: 'Alice',
            email: 'alice@example.com'
        };
    }
    
    @Post('/')
    async createUser(@Body() body: any) {
        return {
            message: 'User created',
            data: body
        };
    }
    
    @Put('/:id')
    async updateUser(
        @Param('id') id: string,
        @Body() body: any
    ) {
        return {
            message: 'User updated',
            id,
            data: body
        };
    }
    
    @Delete('/:id')
    async deleteUser(@Param('id') id: string) {
        return { message: 'User deleted', id };
    }
}

// Mount the controller
app.mount('/api', UserController);
```

#### Available Decorators

<!-- - `@Controller(path)` - Define base path for controller -->
- `@Get(path)` - GET route
- `@Post(path)` - POST route
- `@Put(path)` - PUT route
- `@Patch(path)` - PATCH route
- `@Delete(path)` - DELETE route
- `@Options(path)` - OPTIONS route
- `@Head(path)` - HEAD route
- `@All(path)` - Match all HTTP methods

**Parameter Decorators:**

- `@Param(name)` - Extract path parameter
- `@Query(name)` - Extract query parameter
- `@Body()` - Parse request body
- `@Headers(name)` - Extract header
- `@Ctx()` - Access full context
- `@Req()` - Access request object

### Middleware

Middleware functions have access to the context and can control request flow:

```typescript
import { Middleware } from 'shokupan';

// Simple logging middleware
const logger: Middleware = async (ctx, next) => {
    console.log(`${ctx.method} ${ctx.path}`);
    const start = Date.now();
    
    const result = await next();
    
    console.log(`${ctx.method} ${ctx.path} - ${Date.now() - start}ms`);
    return result;
};

app.use(logger);

// Authentication middleware
const auth: Middleware = async (ctx, next) => {
    const token = ctx.headers.get('Authorization');
    
    if (!token) {
        return ctx.json({ error: 'Unauthorized' }, 401);
    }
    
    // Validate token and attach user to state
    ctx.state.user = { id: '123', name: 'Alice' };
    
    return next();
};

// Apply to specific routes
app.get('/protected', auth, (ctx) => {
    return { user: ctx.state.user };
});
```

Or use with decorators:
```ts
import { Use } from 'shokupan';

@Controller('/admin')
@Use(auth) // Apply to all routes in controller
export class AdminController {
    
    @Get('/dashboard')
    getDashboard(@Ctx() ctx) {
        return { user: ctx.state.user };
    }
}
```

### Context

The `ShokupanContext` provides a rich API for handling requests and responses:

```typescript
app.get('/demo', async (ctx) => {
    // Request properties
    ctx.method;              // HTTP method
    ctx.path;                // URL path
    ctx.url;                 // Full URL
    ctx.params;              // Path parameters
    ctx.query;               // Query string (URLSearchParams)
    ctx.headers;             // Headers (Headers object)
    
    // Request body
    const body = await ctx.body();           // Auto-parsed JSON/form/multipart
    const json = await ctx.req.json();       // JSON body
    const text = await ctx.req.text();       // Text body
    const form = await ctx.req.formData();   // Form data
    
    // State (shared across middleware)
    ctx.state.user = { id: '123' };
    
    // Response helpers
    return ctx.json({ message: 'Hello' });   // JSON response
    return ctx.text('Hello World');          // Text response
    return ctx.html('<h1>Hello</h1>');       // HTML response
    return ctx.redirect('/new-path');        // Redirect
    
    // Set response headers
    ctx.set('X-Custom-Header', 'value');
    
    // Set cookies
    ctx.setCookie('session', 'abc123', {
        httpOnly: true,
        secure: true,
        maxAge: 3600
    });
    
    // Return Response directly
    return new Response('Custom response', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
    });
});
```

### Static Files

Serve static files with directory listing support:

```typescript
// Serve static files from a directory
app.static('/public', {
    root: './public',
    listDirectory: true  // Enable directory listing
});

// Multiple static directories
app.static('/images', {
    root: './assets/images',
    listDirectory: true
});

app.static('/js', {
    root: './assets/js',
    listDirectory: false
});

// Files available at:
// GET /public/style.css -> ./public/style.css
// GET /images/logo.png -> ./assets/images/logo.png
```

## 🔌 Plugins

### CORS

Configure Cross-Origin Resource Sharing:

```typescript
import { Cors } from 'shokupan';

// Simple CORS - allow all origins
app.use(Cors());

// Custom configuration
app.use(Cors({
    origin: 'https://example.com',
    methods: ['GET', 'POST', 'PUT'],
    credentials: true,
    maxAge: 86400
}));

// Multiple origins
app.use(Cors({
    origin: ['https://example.com', 'https://app.example.com'],
    credentials: true
}));

// Dynamic origin validation
app.use(Cors({
    origin: (ctx) => {
        const origin = ctx.headers.get('origin');
        // Validate origin dynamically
        return origin?.endsWith('.example.com') ? origin : false;
    },
    credentials: true
}));

// Full options
app.use(Cors({
    origin: '*',                           // or string, string[], function
    methods: 'GET,POST,PUT,DELETE',        // or string[]
    allowedHeaders: ['Content-Type'],      // or string
    exposedHeaders: ['X-Total-Count'],     // or string
    credentials: true,
    maxAge: 86400                          // Preflight cache duration
}));
```

### Compression

Enable response compression:

```typescript
import { Compression } from 'shokupan';

// Simple compression
app.use(Compression());

// Custom configuration
app.use(Compression({
    threshold: 1024,  // Only compress responses larger than 1KB
    level: 6          // Compression level (1-9)
}));
```

### Rate Limiting

Protect your API from abuse:

```typescript
import { RateLimit } from 'shokupan';

// Basic rate limiting - 100 requests per 15 minutes
app.use(RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
}));

// Different limits for different routes
const apiLimiter = RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP'
});

const authLimiter = RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts'
});

app.use('/api', apiLimiter);
app.use('/auth/login', authLimiter);

// Custom key generator
app.use(RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    keyGenerator: (ctx) => {
        // Rate limit by user ID instead of IP
        return ctx.state.user?.id || ctx.ip;
    }
}));
```

### Security Headers

Add security headers to responses:

```typescript
import { SecurityHeaders } from 'shokupan';

// Default secure headers
app.use(SecurityHeaders());

// Custom configuration
app.use(SecurityHeaders({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "https://trusted-cdn.com"],
            imgSrc: ["'self'", "data:", "https:"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: {
        action: 'deny'
    }
}));
```

### Sessions

Session management with connect-style store support:

```typescript
import { Session } from 'shokupan';

// Basic session with memory store (development only)
app.use(Session({
    secret: 'your-secret-key'
}));

// Full configuration
app.use(Session({
    secret: 'your-secret-key',
    name: 'sessionId',              // Cookie name
    resave: false,                   // Don't save unchanged sessions
    saveUninitialized: false,        // Don't create sessions until needed
    cookie: {
        httpOnly: true,
        secure: true,                // HTTPS only
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
    }
}));

// Use session in routes
app.get('/login', async (ctx) => {
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
```

#### Using Connect-Style Session Stores

Shokupan is compatible with connect/express-session stores:

```typescript
import { Session } from 'shokupan';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

// Redis session store
const redisClient = createClient();
await redisClient.connect();

app.use(Session({
    secret: 'your-secret-key',
    store: new RedisStore({ client: redisClient }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000
    }
}));
```

Compatible stores include:
- `connect-redis` - Redis
- `connect-mongo` - MongoDB
- `connect-sqlite3` - SQLite
- `session-file-store` - File system
- Any connect-compatible session store

### Authentication

Built-in OAuth2 support with multiple providers:

```typescript
import { AuthPlugin } from 'shokupan';

const auth = new AuthPlugin({
    jwtSecret: 'your-jwt-secret',
    jwtExpiration: '7d',
    
    // Cookie configuration
    cookieOptions: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax'
    },
    
    // GitHub OAuth
    github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        redirectUri: 'http://localhost:3000/auth/github/callback'
    },
    
    // Google OAuth
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        redirectUri: 'http://localhost:3000/auth/google/callback'
    },
    
    // Microsoft OAuth
    microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID!,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
        redirectUri: 'http://localhost:3000/auth/microsoft/callback',
        tenantId: 'common'
    },
    
    // Apple OAuth
    apple: {
        clientId: process.env.APPLE_CLIENT_ID!,
        clientSecret: process.env.APPLE_CLIENT_SECRET!,
        redirectUri: 'http://localhost:3000/auth/apple/callback',
        teamId: process.env.APPLE_TEAM_ID!,
        keyId: process.env.APPLE_KEY_ID!
    },
    
    // Auth0
    auth0: {
        clientId: process.env.AUTH0_CLIENT_ID!,
        clientSecret: process.env.AUTH0_CLIENT_SECRET!,
        redirectUri: 'http://localhost:3000/auth/auth0/callback',
        domain: 'your-tenant.auth0.com'
    },
    
    // Okta
    okta: {
        clientId: process.env.OKTA_CLIENT_ID!,
        clientSecret: process.env.OKTA_CLIENT_SECRET!,
        redirectUri: 'http://localhost:3000/auth/okta/callback',
        domain: 'your-domain.okta.com'
    },
    
    // Custom OAuth2
    oauth2: {
        clientId: 'your-client-id',
        clientSecret: 'your-client-secret',
        redirectUri: 'http://localhost:3000/auth/custom/callback',
        authUrl: 'https://provider.com/oauth/authorize',
        tokenUrl: 'https://provider.com/oauth/token',
        userInfoUrl: 'https://provider.com/oauth/userinfo'
    }
});

// Mount auth routes at /auth
app.mount('/auth', auth);

// Protect routes with auth middleware
app.get('/protected', auth.middleware(), (ctx) => {
    return { user: ctx.state.user };
});

// Available auth routes:
// GET  /auth/github
// GET  /auth/github/callback
// GET  /auth/google
// GET  /auth/google/callback
// ... (and all other providers)
```

### Validation

Validate request data with your favorite validation library:

```typescript
import { validate } from 'shokupan';
import { z } from 'zod';

// Zod validation
const userSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    age: z.number().min(18)
});

app.post('/users',
    validate({ body: userSchema }),
    async (ctx) => {
        const body = await ctx.body(); // Already validated!
        return { created: body };
    }
);

// Validate query parameters
const searchSchema = z.object({
    q: z.string(),
    page: z.coerce.number().default(1),
    limit: z.coerce.number().max(100).default(10)
});

app.get('/search',
    validate({ query: searchSchema }),
    (ctx) => {
        const q = ctx.query.get('q');
        const page = ctx.query.get('page');
        return { q, page };
    }
);

// Validate path parameters
app.get('/users/:id',
    validate({
        params: z.object({
            id: z.string().uuid()
        })
    }),
    (ctx) => {
        return { id: ctx.params.id };
    }
);

// Validate headers
app.post('/webhook',
    validate({
        headers: z.object({
            'x-webhook-signature': z.string()
        })
    }),
    async (ctx) => {
        // Process webhook
    }
);
```

#### TypeBox Validation

```typescript
import { Type } from '@sinclair/typebox';
import { validate } from 'shokupan';

const UserSchema = Type.Object({
    name: Type.String({ minLength: 2 }),
    email: Type.String({ format: 'email' }),
    age: Type.Number({ minimum: 18 })
});

app.post('/users',
    validate({ body: UserSchema }),
    async (ctx) => {
        const user = await ctx.body();
        return { created: user };
    }
);
```

#### Ajv Validation

```typescript
import Ajv from 'ajv';
import { validate } from 'shokupan';

const ajv = new Ajv();
const userSchema = ajv.compile({
    type: 'object',
    properties: {
        name: { type: 'string', minLength: 2 },
        email: { type: 'string', format: 'email' },
        age: { type: 'number', minimum: 18 }
    },
    required: ['name', 'email', 'age']
});

app.post('/users',
    validate({ body: userSchema }),
    async (ctx) => {
        const user = await ctx.body();
        return { created: user };
    }
);
```

#### Valibot Validation

```typescript
import * as v from 'valibot';
import { validate, valibot } from 'shokupan';

const UserSchema = v.object({
    name: v.pipe(v.string(), v.minLength(2)),
    email: v.pipe(v.string(), v.email()),
    age: v.pipe(v.number(), v.minValue(18))
});

app.post('/users',
    validate({ 
        body: valibot(UserSchema, v.parseAsync)
    }),
    async (ctx) => {
        const user = await ctx.body();
        return { created: user };
    }
);
```

### Scalar (OpenAPI)

Beautiful, interactive API documentation:

```typescript
import { ScalarPlugin } from 'shokupan';

app.mount('/docs', new ScalarPlugin({
    baseDocument: {
        info: {
            title: 'My API',
            version: '1.0.0',
            description: 'API documentation'
        }
    },
    config: {
        theme: 'purple',
        layout: 'modern'
    }
}));

// Access docs at http://localhost:3000/docs
```

The Scalar plugin automatically generates OpenAPI documentation from your routes and controllers!

## 🚀 Advanced Features

### Dependency Injection

Shokupan includes a simple but powerful DI container:

```typescript
import { Container } from 'shokupan';

// Register services
class Database {
    query(sql: string) {
        return [];
    }
}

class UserService {
    constructor(private db: Database) {}
    
    getUsers() {
        return this.db.query('SELECT * FROM users');
    }
}

Container.register('db', Database);
Container.register('userService', UserService);

// Use in controllers
@Controller('/users')
export class UserController {
    constructor(
        private userService: UserService = Container.resolve('userService')
    ) {}
    
    @Get('/')
    getUsers() {
        return this.userService.getUsers();
    }
}
```

### OpenAPI Generation

Generate OpenAPI specs automatically and add custom documentation:

```typescript
// Add OpenAPI metadata to routes
app.get('/users/:id', {
    summary: 'Get user by ID',
    description: 'Retrieves a single user by their unique identifier',
    tags: ['Users'],
    parameters: [{
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' }
    }],
    responses: {
        200: {
            description: 'User found',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' }
                        }
                    }
                }
            }
        },
        404: {
            description: 'User not found'
        }
    }
}, (ctx) => {
    return { id: ctx.params.id, name: 'Alice' };
});

// Generate OpenAPI spec
const spec = app.computeOpenAPISpec({
    info: {
        title: 'My API',
        version: '1.0.0'
    }
});
```

### Sub-Requests

Make internal requests without HTTP overhead:

```typescript
import { ShokupanRouter } from 'shokupan';

const router = new ShokupanRouter();

// Service endpoints
router.get('/wines/red', async (ctx) => {
    const response = await fetch('https://api.sampleapis.com/wines/reds');
    return response.json();
});

router.get('/wines/white', async (ctx) => {
    const response = await fetch('https://api.sampleapis.com/wines/whites');
    return response.json();
});

// Aggregate endpoint using sub-requests
router.get('/wines/all', async (ctx) => {
    // Make parallel sub-requests
    const [redResponse, whiteResponse] = await Promise.all([
        router.subRequest('/wines/red'),
        router.subRequest('/wines/white')
    ]);
    
    const red = await redResponse.json();
    const white = await whiteResponse.json();
    
    return { red, white };
});

app.mount('/api', router);

// GET /api/wines/all
// Returns both red and white wines aggregated
```

Sub-requests are great for:
- Service composition
- Backend-for-Frontend (BFF) patterns
- Internal API aggregation
- Testing

### OpenTelemetry

Built-in distributed tracing support:

```typescript
const app = new Shokupan({
    port: 3000,
    development: true,
    enableAsyncLocalStorage: true  // Enable for better trace context
});

// Tracing is automatic!
// All routes and middleware are instrumented
// Sub-requests maintain trace context
```

Configure OpenTelemetry exporters in your environment:

```typescript
// src/instrumentation.ts
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';

const provider = new NodeTracerProvider();
provider.addSpanProcessor(
    new BatchSpanProcessor(
        new OTLPTraceExporter({
            url: 'http://localhost:4318/v1/traces'
        })
    )
);
provider.register();
```

## 📦 Migration Guides

### From Express

Shokupan is designed to feel familiar to Express developers. Here's how to migrate:

#### Basic Server

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

#### Request/Response

**Express:**
```typescript
app.get('/users/:id', (req, res) => {
    const id = req.params.id;
    const page = req.query.page;
    const token = req.headers.authorization;
    
    res.status(200).json({
        id,
        page,
        authenticated: !!token
    });
});
```

**Shokupan:**
```typescript
app.get('/users/:id', (ctx) => {
    const id = ctx.params.id;
    const page = ctx.query.get('page');
    const token = ctx.headers.get('authorization');
    
    return ctx.json({
        id,
        page,
        authenticated: !!token
    }, 200);
    
    // Or simply return an object (auto JSON, status 200)
    return { id, page, authenticated: !!token };
});
```

#### Middleware

**Express:**
```typescript
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

app.use(express.json());
app.use(cors());
```

**Shokupan:**
```typescript
import { Cors } from 'shokupan';

app.use(async (ctx, next) => {
    console.log(`${ctx.method} ${ctx.path}`);
    return next();
});

// Body parsing is built-in, no middleware needed
app.use(Cors());
```

#### Static Files

**Express:**
```typescript
app.use('/public', express.static('public'));
```

**Shokupan:**
```typescript
app.static('/public', {
    root: './public',
    listDirectory: true
});
```

#### Key Differences

1. **Context vs Req/Res**: Shokupan uses a single `ctx` object
2. **Return vs Send**: Return values directly instead of calling `res.json()` or `res.send()`
3. **Built-in Parsing**: Body parsing is automatic, no need for `express.json()`
4. **Async by Default**: All handlers and middleware are naturally async
5. **Web Standard APIs**: Uses `Headers`, `URL`, `Response` etc. from web standards

### From Koa

Shokupan's context-based approach is heavily inspired by Koa:

#### Basic Differences

**Koa:**
```typescript
import Koa from 'koa';

const app = new Koa();

app.use(async (ctx, next) => {
    ctx.body = { message: 'Hello' };
});

app.listen(3000);
```

**Shokupan:**
```typescript
import { Shokupan } from 'shokupan';

const app = new Shokupan({ port: 3000 });

app.get('/', async (ctx) => {
    return { message: 'Hello' };
});

app.listen();
```

#### Middleware

**Koa:**
```typescript
app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`${ctx.method} ${ctx.url} - ${ms}ms`);
});
```

**Shokupan:**
```typescript
app.use(async (ctx, next) => {
    const start = Date.now();
    const result = await next();
    const ms = Date.now() - start;
    console.log(`${ctx.method} ${ctx.url} - ${ms}ms`);
    return result;  // Don't forget to return!
});
```

#### Routing

**Koa (with koa-router):**
```typescript
import Router from '@koa/router';

const router = new Router();

router.get('/users/:id', (ctx) => {
    ctx.body = { id: ctx.params.id };
});

app.use(router.routes());
```

**Shokupan:**
```typescript
import { ShokupanRouter } from 'shokupan';

const router = new ShokupanRouter();

router.get('/users/:id', (ctx) => {
    return { id: ctx.params.id };
});

app.mount('/', router);
```

#### Key Differences

1. **Return Value**: Shokupan requires returning the response from middleware
2. **Routing**: Built-in routing, no need for external router package
3. **Context Properties**: Some property names differ (`ctx.path` vs `ctx.url`)
4. **Body Parsing**: Built-in, no need for koa-bodyparser

### From NestJS

Moving from NestJS to Shokupan:

#### Controllers

**NestJS:**
```typescript
import { Controller, Get, Post, Param, Body } from '@nestjs/common';

@Controller('users')
export class UserController {
    @Get(':id')
    getUser(@Param('id') id: string) {
        return { id, name: 'Alice' };
    }
    
    @Post()
    createUser(@Body() body: CreateUserDto) {
        return { created: body };
    }
}
```

**Shokupan:**
```typescript
import { Controller, Get, Post, Param, Body } from 'shokupan';

@Controller('/users')
export class UserController {
    @Get('/:id')
    getUser(@Param('id') id: string) {
        return { id, name: 'Alice' };
    }
    
    @Post('/')
    createUser(@Body() body: CreateUserDto) {
        return { created: body };
    }
}
```

#### Dependency Injection

**NestJS:**
```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class UserService {
    getUsers() {
        return [];
    }
}

@Controller('users')
export class UserController {
    constructor(private userService: UserService) {}
    
    @Get()
    getUsers() {
        return this.userService.getUsers();
    }
}
```

**Shokupan:**
```typescript
import { Container } from 'shokupan';

class UserService {
    getUsers() {
        return [];
    }
}

Container.register('userService', UserService);

@Controller('/users')
export class UserController {
    constructor(
        private userService: UserService = Container.resolve('userService')
    ) {}
    
    @Get('/')
    getUsers() {
        return this.userService.getUsers();
    }
}
```

#### Guards

**NestJS:**
```typescript
import { CanActivate, ExecutionContext } from '@nestjs/common';

export class AuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        return validateToken(request.headers.authorization);
    }
}

@Controller('admin')
@UseGuards(AuthGuard)
export class AdminController {}
```

**Shokupan:**
```typescript
import { Middleware, Use } from 'shokupan';

const authGuard: Middleware = async (ctx, next) => {
    if (!validateToken(ctx.headers.get('authorization'))) {
        return ctx.json({ error: 'Unauthorized' }, 401);
    }
    return next();
};

@Controller('/admin')
@Use(authGuard)
export class AdminController {}
```

#### Validation

**NestJS:**
```typescript
import { IsString, IsEmail, IsNumber } from 'class-validator';

export class CreateUserDto {
    @IsString()
    name: string;
    
    @IsEmail()
    email: string;
    
    @IsNumber()
    age: number;
}
```

**Shokupan:**
```typescript
import { z } from 'zod';
import { validate } from 'shokupan';

const createUserSchema = z.object({
    name: z.string(),
    email: z.string().email(),
    age: z.number()
});

@Post('/')
@Use(validate({ body: createUserSchema }))
createUser(@Body() body: any) {
    return { created: body };
}
```

#### Key Differences

1. **Lighter DI**: Manual registration vs automatic
2. **Middleware over Guards**: Use middleware pattern instead of guards
3. **Validation Libraries**: Use Zod/Ajv/TypeBox instead of class-validator
4. **Module System**: No modules, simpler structure
5. **Less Boilerplate**: More straightforward setup

### Using Express Middleware

Many Express middleware packages work with Shokupan:

```typescript
import { Shokupan, useExpress } from 'shokupan';
import helmet from 'helmet';
import compression from 'compression';

const app = new Shokupan();

// Use Express middleware
app.use(useExpress(helmet()));
app.use(useExpress(compression()));
```

**Note**: While many Express middleware will work, native Shokupan plugins are recommended for better performance and TypeScript support.

## 🧪 Testing

Shokupan applications are easy to test using Bun's built-in test runner.

```typescript
import { describe, it, expect } from 'bun:test';
import { Shokupan } from 'shokupan';

describe('My App', () => {
    it('should return hello world', async () => {
        const app = new Shokupan();
        
        app.get('/', () => ({ message: 'Hello' }));
        
        // Process a request without starting the server
        const res = await app.processRequest({
            method: 'GET',
            path: '/'
        });
        
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ message: 'Hello' });
    });
});
```

## 🚢 Deployment

Since Shokupan is built on Bun, deployment is straightforward.

### Using Bun

```bash
bun run src/index.ts
```

### Docker

```dockerfile
FROM oven/bun:1

WORKDIR /app

COPY . .
RUN bun install --production

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
```

## 🛠️ CLI Tools

Shokupan includes a CLI for scaffolding:

```bash
# Install globally
bun add -g shokupan

# Or use with bunx
bunx shokupan
```

### Generate Controller

```bash
shokupan generate controller User
# or
skp g controller User
```

Generates:
```typescript
import { Controller, Get, Post, Put, Delete, Param, Body } from 'shokupan';

@Controller('/user')
export class UserController {
    
    @Get('/')
    async getAll() {
        return { users: [] };
    }
    
    @Get('/:id')
    async getById(@Param('id') id: string) {
        return { id };
    }
    
    @Post('/')
    async create(@Body() body: any) {
        return { created: body };
    }
    
    @Put('/:id')
    async update(@Param('id') id: string, @Body() body: any) {
        return { id, updated: body };
    }
    
    @Delete('/:id')
    async delete(@Param('id') id: string) {
        return { id, deleted: true };
    }
}
```

### Generate Middleware

```bash
shokupan generate middleware auth
# or
skp g middleware auth
```

### Generate Plugin

```bash
shokupan generate plugin custom
# or
skp g plugin custom
```

## 📚 API Reference

### Shokupan Class

Main application class.

```typescript
const app = new Shokupan(config?: ShokupanConfig);
```

**Config Options:**
- `port?: number` - Port to listen on (default: 3000)
- `hostname?: string` - Hostname (default: "localhost")
- `development?: boolean` - Development mode (default: auto-detect)
- `enableAsyncLocalStorage?: boolean` - Enable async context tracking
- `logger?: Logger` - Custom logger instance

**Methods:**
- `add({ method, path, spec, handler, regex, group)` - Add a route with any HTTP method.
- `get(path, spec?, ...handlers)` - Add GET route
- `post(path, spec?, ...handlers)` - Add POST route
- `put(path, spec?, ...handlers)` - Add PUT route
- `patch(path, spec?, ...handlers)` - Add PATCH route
- `delete(path, spec?, ...handlers)` - Add DELETE route
- `options(path, spec?, ...handlers)` - Add OPTIONS route
- `head(path, spec?, ...handlers)` - Add HEAD route
- `use(middleware)` - Add middleware
- `mount(path, controller)` - Mount controller or router
- `static(path, options)` - Serve static files
- `listen(port?)` - Start server
- `processRequest(options)` - Process request (testing)
- `subRequest(options)` - Make sub-request
- `computeOpenAPISpec(base)` - Generate OpenAPI spec

### ShokupanRouter Class

Router for grouping routes.

```typescript
const router = new ShokupanRouter(config?: ShokupanRouteConfig);
```

**Config Options:**
- `name?: string` - Name of the router
- `group?: string` - Group of the router
- `openapi?: boolean` - OpenAPI spec applied to all endpoints of the router

**Methods:**
- `add({ method, path, spec, handler, regex, group)` - Add a route with any HTTP method.
- `get(path, spec?, ...handlers)` - Add GET route
- `post(path, spec?, ...handlers)` - Add POST route
- `put(path, spec?, ...handlers)` - Add PUT route
- `patch(path, spec?, ...handlers)` - Add PATCH route
- `delete(path, spec?, ...handlers)` - Add DELETE route
- `options(path, spec?, ...handlers)` - Add OPTIONS route
- `head(path, spec?, ...handlers)` - Add HEAD route
- `mount(path, controller)` - Mount controller or router
- `static(path, options)` - Serve static files
- `processRequest(options)` - Process request (testing)
- `subRequest(options)` - Make sub-request


### ShokupanContext

Request context object.

**Properties:**
- `req: Request` - Request object
- `method: string` - HTTP method
- `path: string` - URL path
- `url: URL` - Full URL
- `params: Record<string, string>` - Path parameters
- `query: URLSearchParams` - Query parameters
- `headers: Headers` - Request headers
- `state: Record<string, any>` - Shared state object
- `session: any` - Session data (with session plugin)
- `response: ShokupanResponse` - Response builder

**Methods:**
- `set(name: string, value: string): ShokupanContext` - Set a response header
- `setCookie(name: string, value: string, options?: CookieOptions): ShokupanContext` - Set a response cookie
- `send(body?: BodyInit, options?: ResponseInit): Response` - Return response
- `status(code: number): Response` - Return status code default response
- `body(): Promise<any>` - Parse request body
- `json(data: any, status?: number): ShokupanContext` - Return JSON response
- `text(data: string, status?: number): ShokupanContext` - Return text response
- `html(data: string, status?: number): ShokupanContext` - Return HTML response
- `redirect(url: string, status?: number): ShokupanContext` - Redirect response
- `file(path: string, fileOptions?: BlobPropertyBag, responseOptions?: ResponseInit): Response` - Return file response

### Container

Dependency injection container. This feature is still experimental and subject to change.

```typescript
Container.register(name: string, classOrFactory: any);
Container.resolve<T>(name: string): T;
Container.clear();
```

## 🗺️ Roadmap

### Current Features

- ✅ **Built for Bun** - Native performance
- ✅ **Express Ecosystem** - Middleware support
- ✅ **TypeScript First** - Decorators, Generics, Type Safety
- ✅ **Auto OpenAPI** - [Scalar](https://github.com/scalar/scalar) documentation
- ✅ **Rich Plugin System** - CORS, Session, Validation, Rate Limiting etc.
- ✅ **Dependency Injection** - Container for dependency injection
- ✅ **OpenTelemetry** - Built-in [OpenTelemetry](https://opentelemetry.io/) traces
- ✅ **OAuth2** - Built-in [OAuth2](https://oauth.net/2/) support
- ✅ **Request-Scoped Globals** - Request-scoped values via [AsyncLocalStorage](https://docs.deno.com/api/node/async_hooks/~/AsyncLocalStorage)
- ✅ **Runtime Compatibility** - Support for [Deno](https://deno.com/) and [Node.js](https://nodejs.org/)
- ✅ **Deep Introspection** - Type analysis for enhanced OpenAPI generation
- ✅ **Controller Mode** - Option for controller-only mode
- ✅ **Supports Node/Deno** - Shokupan can run on Node.js or Deno
- ✅ **OpenAPI Validation** - Built-in [OpenAPI](https://www.openapis.org/) validation

### Future Features

- 🚧 **Framework Plugins** - Drop-in adapters for [Express](https://expressjs.com/), [Koa](https://koajs.com/), and [Elysia](https://elysiajs.com/)
- 🚧 **Enhanced WebSockets** - Event support and HTTP simulation
- 🚧 **Benchmarks** - Comprehensive performance comparisons
- 🚧 **Scaling** - Automatic clustering support
- 🚧 **RPC Support** - [tRPC](https://trpc.io/) and [gRPC](https://grpc.io/) integration
- 🚧 **Binary Formats** - [Protobuf](https://protobuf.dev/) and [MessagePack](https://msgpack.org/) support
- 🚧 **Reliability** - Circuit breaker pattern for resilience
- 🚧 **Standardized Errors** - Consistent 4xx/5xx error formats

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [Express](https://expressjs.com/), [Koa](https://koajs.com/), [NestJS](https://nestjs.com/), and [Elysia](https://elysiajs.com/)
- Built for the amazing [Bun](https://bun.sh/) runtime
- Powered by [Arctic](https://github.com/pilcrowonpaper/arctic) for OAuth2 support

---

**Made with 🍞 by the Shokupan team**
