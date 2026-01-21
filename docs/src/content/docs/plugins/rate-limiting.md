---
title: Rate Limiting
description: Protect your API from abuse
---

The Rate Limit plugin protects your API from abuse by limiting the number of requests from a single IP address.

## Basic Usage

```typescript
import { Shokupan, RateLimit } from 'shokupan';

const app = new Shokupan();

// Default: 5 requests per 1 minute
app.use(RateLimit());

app.listen();
```

## Configuration

```typescript
app.use(RateLimit({
    windowMs: 60 * 1000,        // Time window (1 minute)
    max: 5,                     // Max requests per window
    message: 'Too many requests', // Response message
    statusCode: 429,            // HTTP status code
    keyGenerator: (ctx) => ctx.ip, // How to identify clients
    headers: true,              // Send X-RateLimit headers
    mode: 'user',               // 'user' (default) or 'absolute'
    cleanupInterval: 60000,     // Cleanup interval (default: windowMs)
    trustedProxies: []          // List of trusted proxy IPs
}));
```

## Options

- **windowMs**: Time window in milliseconds (default: `60000`)
- **max** (or **limit**): Max hits per window (default: `5`)
- **message**: Response message or object (default: `"Too many requests..."`)
- **statusCode**: HTTP status for limited requests (default: `429`)
- **headers**: Send `X-RateLimit-*` headers (default: `true`)
- **keyGenerator**: Function to generate unique key (default: `ctx.ip`)
- **onRateLimited**: Hook called when limit is reached
- **skip**: Function to skip limiting
- **mode**: `'user'` (default) or `'absolute'`
- **trustedProxies**: IPs to trust for `X-Forwarded-For`
- **cleanupInterval**: Interval to clear expired records
```

## Different Limits per Route

```typescript
const apiLimiter = RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

const authLimiter = RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts'
});

app.use('/api', apiLimiter);
app.use('/auth/login', authLimiter);
```

## Custom Key Generator

Rate limit by user ID instead of IP:

```typescript
app.use(RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    keyGenerator: (ctx) => {
        // Use user ID if authenticated, otherwise IP
        return ctx.state.user?.id || ctx.ip;
    }
}));
```

## Skip Requests

Skip rate limiting for certain requests:

```typescript
app.use(RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    skip: (ctx) => {
        // Skip rate limiting for admin users
        return ctx.state.user?.role === 'admin';
    }
}));
```

## Response Headers

The plugin adds these headers to responses:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Time when the limit resets (Unix timestamp)

## Common Patterns

### API Protection

```typescript
app.use('/api', RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
}));
```

### Auth Protection

```typescript
app.use('/auth/login', RateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5
}));
```

### Registration Protection

```typescript
app.use('/auth/register', RateLimit({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 3
}));
```

## Next Steps

- [Security Headers](/plugins/security-headers/) - Add security headers
- [Authentication](/plugins/authentication/) - Secure your API
- [CORS](/plugins/cors/) - Configure CORS
