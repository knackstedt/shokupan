---
title: Security Headers
description: Add security headers to responses
---

The Security Headers plugin adds important security headers to protect your application from common web vulnerabilities.

## Basic Usage

```typescript
import { Shokupan, SecurityHeaders } from 'shokupan';

const app = new Shokupan();

// Default secure headers
app.use(SecurityHeaders());

app.listen();
```

This adds:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (HSTS)
- Content Security Policy (CSP)

## Custom Configuration

```typescript
app.use(SecurityHeaders({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "https://trusted-cdn.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.example.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    hsts: {
        maxAge: 31536000,        // 1 year
        includeSubDomains: true,
        preload: true
    },
    frameguard: {
        action: 'deny'  // or 'sameorigin'
    }
}));
```

## Content Security Policy (CSP)

Prevent XSS and injection attacks:

```typescript
app.use(SecurityHeaders({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.example.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://api.example.com"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"]
        }
    }
}));
```

## HSTS (HTTP Strict Transport Security)

Force HTTPS connections:

```typescript
app.use(SecurityHeaders({
    hsts: {
        maxAge: 31536000,        // 1 year in seconds
        includeSubDomains: true, // Apply to all subdomains
        preload: true            // Submit to HSTS preload list
    }
}));
```

## Frame Options

Prevent clickjacking:

```typescript
app.use(SecurityHeaders({
    frameguard: {
        action: 'deny'  // Don't allow in iframes at all
        // or
        action: 'sameorigin'  // Allow only same origin
    }
}));
```

## Disable Specific Headers

```typescript
app.use(SecurityHeaders({
    contentSecurityPolicy: false,  // Disable CSP
    hsts: false                     // Disable HSTS
}));
```

## Development vs Production

```typescript
const isDev = process.env.NODE_ENV !== 'production';

app.use(SecurityHeaders({
    hsts: isDev ? false : {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: isDev 
                ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
                : ["'self'"]
        }
    }
}));
```

## All Headers Explained

- **Content-Security-Policy**: Prevents XSS attacks
- **X-Content-Type-Options**: Prevents MIME type sniffing (default: `nosniff`)
- **X-Frame-Options**: Prevents clickjacking (default: `SAMEORIGIN`)
- **X-XSS-Protection**: Browser XSS protection (default: `0` - disabled for modern security)
- **Strict-Transport-Security**: Forces HTTPS (default: max-age 180 days)
- **Referrer-Policy**: Controls referrer information (default: `no-referrer`)
- **X-Download-Options**: IE8 specific security (default: `noopen`)
- **X-DNS-Prefetch-Control**: Controls DNS prefetching
- **Cross-Origin-Opener-Policy**: Isolates browsing context
- **Cross-Origin-Embedder-Policy**: Controls resource embedding
- **Cross-Origin-Resource-Policy**: Controls resource sharing

## Next Steps

- [CORS](/plugins/cors/) - Configure CORS
- [Rate Limiting](/plugins/rate-limiting/) - Prevent abuse
- [Authentication](/plugins/authentication/) - Secure your API
