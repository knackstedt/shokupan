---
title: Authentication
description: OAuth2 authentication with multiple providers
---

Shokupan provides built-in OAuth2 authentication with support for GitHub, Google, Microsoft, Apple, Auth0, Okta, and custom providers.

## Quick Start

```bash
bun add shokupan
```

```typescript
import { Shokupan, AuthPlugin } from 'shokupan';

const app = new Shokupan();

const auth = new AuthPlugin({
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiration: '7d',
    
    cookieOptions: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax'
    },
    
    github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        redirectUri: 'http://localhost:3000/auth/github/callback'
    }
});

// Mount auth routes at /auth
app.mount('/auth', auth);

// Protect routes
app.get('/protected', auth.getMiddleware(), (ctx) => {
    return { user: ctx.state.user };
});

app.listen();
```

## Supported Providers

### GitHub

```typescript
const auth = new AuthPlugin({
    jwtSecret: 'your-secret',
    github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        redirectUri: 'http://localhost:3000/auth/github/callback'
    }
});
```

### Google

```typescript
google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: 'http://localhost:3000/auth/google/callback'
}
```

### Microsoft

```typescript
microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    redirectUri: 'http://localhost:3000/auth/microsoft/callback',
    tenantId: 'common'  // or your tenant ID
}
```

### Apple

```typescript
apple: {
    clientId: process.env.APPLE_CLIENT_ID!,
    clientSecret: process.env.APPLE_CLIENT_SECRET!,
    redirectUri: 'http://localhost:3000/auth/apple/callback',
    teamId: process.env.APPLE_TEAM_ID!,
    keyId: process.env.APPLE_KEY_ID!
}
```

### Auth0

```typescript
auth0: {
    clientId: process.env.AUTH0_CLIENT_ID!,
    clientSecret: process.env.AUTH0_CLIENT_SECRET!,
    redirectUri: 'http://localhost:3000/auth/auth0/callback',
    domain: 'your-tenant.auth0.com'
}
```

### Okta

```typescript
okta: {
    clientId: process.env.OKTA_CLIENT_ID!,
    clientSecret: process.env.OKTA_CLIENT_SECRET!,
    redirectUri: 'http://localhost:3000/auth/okta/callback',
    domain: 'your-domain.okta.com'
}
```

### Custom OAuth2

```typescript
oauth2: {
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    redirectUri: 'http://localhost:3000/auth/custom/callback',
    authUrl: 'https://provider.com/oauth/authorize',
    tokenUrl: 'https://provider.com/oauth/token',
    userInfoUrl: 'https://provider.com/oauth/userinfo'
}
```

## Auth Routes

The plugin automatically creates these routes for each configured provider:

- `GET /auth/{provider}/login` - Initiate OAuth flow
- `GET /auth/{provider}/callback` - OAuth callback

Example flow:

```
1. User visits →  GET /auth/github/login
2. Redirected to GitHub OAuth
3. User authorizes
4. Callback →     GET /auth/github/callback
5. JWT cookie set
6. Redirected to your app
```

## Protecting Routes

Use the auth middleware to protect routes:

```typescript
// Single route
app.get('/profile', auth.middleware(), (ctx) => {
    return ctx.state.user;
});

// Multiple routes
const protectedRouter = new ShokupanRouter();
protectedRouter.use(auth.middleware());

protectedRouter.get('/profile', (ctx) => ({ user: ctx.state.user }));
protectedRouter.get('/settings', (ctx) => ({ settings: {} }));

app.mount('/api', protectedRouter);
```

## With Controllers

```typescript
import { Use } from 'shokupan';

@Use(auth.middleware())
export class UserController {
    @Get('/profile')
    getProfile(@Ctx() ctx: any) {
        return ctx.state.user;
    }
}
```

## JWT Configuration

Configure JWT tokens:

```typescript
const auth = new AuthPlugin({
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiration: '7d',  // or: '1h', '30d', etc.
    
    cookieOptions: {
        httpOnly: true,     // Prevent XSS
        secure: true,       // HTTPS only
        sameSite: 'lax',   // CSRF protection
        maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
    }
});
```

## User Object

After authentication, the user object is available at `ctx.state.user`:

```typescript
app.get('/me', auth.middleware(), (ctx) => {
    const user = ctx.state.user;
    // {
    //   id: 'github:12345',
    //   email: 'user@example.com',
    //   name: 'John Doe',
    //   avatar: 'https://...',
    //   provider: 'github'
    // }
    return user;
});
```

## Frontend Integration

### OAuth Flow

```typescript
// In your frontend
function login(provider: string) {
    window.location.href = `http://localhost:3000/auth/${provider}`;
}

// Button
<button onclick="login('github')">Login with GitHub</button>
```

### Check Auth Status

```typescript
async function checkAuth() {
    const response = await fetch('http://localhost:3000/auth/me', {
        credentials: 'include'  // Send cookies
    });
    
    if (response.ok) {
        const user = await response.json();
        return user;
    }
    
    return null;
}
```

### Logout

```typescript
async function logout() {
    await fetch('http://localhost:3000/auth/logout', {
        credentials: 'include'
    });
    
    // Redirect or update UI
}
```

## Environment Variables

Create a `.env` file:

```bash
# JWT
JWT_SECRET=your-super-secret-key-change-this

# GitHub
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Google
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Microsoft
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_TENANT_ID=common
```

## Security Best Practices

:::caution[Production Security]
- Always use HTTPS in production (`secure: true`)
- Use strong, random JWT secrets
- Set appropriate cookie expiration
- Validate redirect URIs
- Store secrets in environment variables
:::

```typescript
const auth = new AuthPlugin({
    jwtSecret: process.env.JWT_SECRET!,  // Strong, random secret
    jwtExpiration: '1h',  // Short expiration
    
    cookieOptions: {
        httpOnly: true,   // Prevent XSS
        secure: process.env.NODE_ENV === 'production',  // HTTPS only
        sameSite: 'strict',  // Strong CSRF protection
        maxAge: 60 * 60 * 1000  // 1 hour
    }
});
```

## Next Steps

- [Sessions](/plugins/sessions/) - Session management
- [Validation](/plugins/validation/) - Validate user input
- [Rate Limiting](/plugins/rate-limiting/) - Protect auth endpoints
