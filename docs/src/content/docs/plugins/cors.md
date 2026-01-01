---
title: CORS
description: Configure Cross-Origin Resource Sharing
---

The CORS plugin handles Cross-Origin Resource Sharing configuration for your API.

## Basic Usage

Allow all origins (development only):

```typescript
import { Shokupan, Cors } from 'shokupan';

const app = new Shokupan();

app.use(Cors());

app.listen();
```

## Configuration

### Single Origin

```typescript
app.use(Cors({
    origin: 'https://example.com',
    credentials: true
}));
```

### Multiple Origins

```typescript
app.use(Cors({
    origin: ['https://example.com', 'https://app.example.com'],
    credentials: true
}));
```

### Dynamic Origin

Validate origins dynamically:

```typescript
app.use(Cors({
    origin: (ctx) => {
        const origin = ctx.headers.get('origin');
        
        // Allow subdomains of example.com
        if (origin?.endsWith('.example.com')) {
            return origin;
        }
        
        // Allow specific origins
        const allowedOrigins = [
            'https://example.com',
            'https://app.example.com'
        ];
        
        return allowedOrigins.includes(origin) ? origin : false;
    },
    credentials: true
}));
```

## Full Options

```typescript
app.use(Cors({
    // Which origins are allowed
    origin: '*',  // or string, string[], or function
    
    // Which HTTP methods are allowed
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    // or: methods: 'GET,POST,PUT,DELETE'
    
    // Which headers can be sent
    allowedHeaders: ['Content-Type', 'Authorization'],
    // or: allowedHeaders: 'Content-Type, Authorization'
    
    // Which headers are exposed to the client
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    // or: exposedHeaders: 'X-Total-Count, X-Page-Count'
    
    // Allow credentials (cookies, authorization headers)
    credentials: true,
    
    // How long preflight requests can be cached (in seconds)
    maxAge: 86400  // 24 hours
}));
```

## Common Patterns

### API with Authentication

```typescript
app.use(Cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### Public API

```typescript
app.use(Cors({
    origin: '*',
    methods: ['GET'],
    credentials: false
}));
```

### Development vs Production

```typescript
const isDev = process.env.NODE_ENV !== 'production';

app.use(Cors({
    origin: isDev ? '*' : process.env.ALLOWED_ORIGINS?.split(','),
    credentials: !isDev,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
```

## Preflight Requests

The CORS plugin automatically handles OPTIONS preflight requests:

```
Client                   Server
  │                        │
  │──OPTIONS /api/users──→│
  │   (preflight)          │
  │                        │
  │←──200 OK──────────────│
  │   Access-Control-*     │
  │                        │
  │──POST /api/users────→│
  │   (actual request)     │
  │                        │
  │←──201 Created─────────│
  │                        │
```

## Per-Route CORS

Apply CORS to specific routes:

```typescript
const corsPublic = Cors({ origin: '*' });
const corsPrivate = Cors({ 
    origin: 'https://app.example.com',
    credentials: true 
});

// Public endpoint
app.get('/api/public', corsPublic, (ctx) => {
    return { data: 'public' };
});

// Private endpoint
app.get('/api/private', corsPrivate, (ctx) => {
    return { data: 'private' };
});
```

## Troubleshooting

### Credentials and Wildcard

:::caution
You cannot use `origin: '*'` with `credentials: true`. Specify exact origins instead.
:::

```typescript
// ❌ Invalid
app.use(Cors({
    origin: '*',
    credentials: true
}));

// ✅ Valid
app.use(Cors({
    origin: ['https://example.com'],
    credentials: true
}));
```

### Headers Not Exposed

If custom headers aren't visible to the client, add them to `exposedHeaders`:

```typescript
app.use(Cors({
    origin: 'https://example.com',
    exposedHeaders: ['X-Custom-Header', 'X-Total-Count']
}));
```

## Next Steps

- [Security Headers](/shokupan/plugins/security-headers/) - Add security headers
- [Authentication](/shokupan/plugins/authentication/) - Secure your API
- [Rate Limiting](/shokupan/plugins/rate-limiting/) - Prevent abuse
