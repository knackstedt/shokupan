---
title: Plugin Dependencies
description: Shokupan uses an optional peer dependency model for plugin-specific packages. This keeps the core framework lean while allowing you to install only the features you need.
---

## Overview

Most of Shokupan's dependencies are **optional peer dependencies**. This means:
- ✅ Smaller install size for basic apps
- ✅ Install only what you use
- ✅ Clear error messages when dependencies are missing
- ✅ Better tree-shaking and bundle optimization

## Plugin Dependencies

### Validation Plugin

**Packages**: `class-transformer`, `class-validator`, `reflect-metadata`

```bash
bun add class-transformer class-validator reflect-metadata
```

**Usage**:
```typescript
import { validate } from 'shokupan';
import { IsString, IsNumber } from 'class-validator';

class CreateUserDto {
    @IsString()
    name: string;
    
    @IsNumber()
    age: number;
}

app.post('/users', validate({ body: CreateUserDto }), async (ctx) => {
    const user = await ctx.body(); // Validated and transformed
    return ctx.json({ user });
});
```

### Auth Plugin

**Packages**: `arctic`, `jose`

```bash
bun add arctic jose
```

**Usage**:
```typescript
import { AuthPlugin } from 'shokupan';

const auth = new AuthPlugin({
    jwtSecret: process.env.JWT_SECRET,
    providers: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
            redirectUri: 'http://localhost:3000/auth/github/callback'
        }
    }
});

app.mount('/auth', auth);
```

### OpenAPI Validator Plugin

**Packages**: `ajv`, `ajv-formats`

```bash
bun add ajv ajv-formats
```

**Usage**:
```typescript
import { enableOpenApiValidation } from 'shokupan';

const app = new Shokupan({ enableOpenApiGen: true });

// Add routes...

enableOpenApiValidation(app); // Validates requests against OpenAPI spec
```

### Scalar API Documentation

**Packages**: `@scalar/api-reference`, `eta`

```bash
bun add @scalar/api-reference eta
```

**Usage**:
```typescript
import { mountScalar } from 'shokupan';

const app = new Shokupan({ enableOpenApiGen: true });

// Add routes...

mountScalar(app, '/docs', {
    title: 'My API Documentation'
});
```

### Static File Serving

**Packages**: `eta`

```bash
bun add eta
```

**Usage**:
```typescript
import { serveStatic } from 'shokupan';

app.mount('/static', serveStatic({
    root: './public',
    listDirectory: true
}));
```

### JSON Parser Options

**Packages**: `parse-json`, `secure-json-parse`

```bash
# For better error messages
bun add parse-json

# For security against prototype pollution
bun add secure-json-parse
```

**Usage**:
```typescript
const app = new Shokupan({
    jsonParser: 'parse-json' // or 'secure-json-parse' or 'native'
});
```

## Core Dependencies

These are always installed and required for core functionality:

| Package | Purpose |
|---------|---------|
| `@scalar/openapi-types` | TypeScript types for OpenAPI |
| `@opentelemetry/*` | Optional tracing support |
| `@surrealdb/node` | Session storage backend |
| `tslib` | TypeScript runtime helpers |

## Error Messages

When you try to use a plugin without its dependencies installed, you'll get a clear error message:

```
Error: class-transformer and class-validator are required for class-based validation.
Install them with: bun add class-transformer class-validator reflect-metadata
```

## Migration from v0.4.x

If you're upgrading from an earlier version where all dependencies were bundled:

### 1. Identify which plugins you use

Check your code for imports from:
- `validation.ts` → needs class-validator packages
- `auth.ts` / `AuthPlugin` → needs arctic, jose
- `openapi-validator.ts` → needs ajv packages
- `serveStatic` / `mountScalar` → needs eta
- `@scalar/api-reference` → needs @scalar/api-reference

### 2. Install the dependencies you need

```bash
# Example: If you use validation and auth
bun add class-transformer class-validator reflect-metadata arctic jose
```

### 3. No code changes needed!

Your existing code will continue to work. The only difference is you need to install the dependencies explicitly.

## Development vs Production

### Development Best Practices

Install all optional dependencies for development:

```bash
bun add -d class-transformer class-validator reflect-metadata \
        arctic jose ajv ajv-formats @scalar/api-reference eta \
        parse-json secure-json-parse
```

### Production Best Practices

Install only what you use:

```bash
# Example: Auth-only API
bun add arctic jose

# Example: Validated REST API with docs
bun add class-transformer class-validator reflect-metadata \
        @scalar/api-reference eta
```

## Bundle Size Impact

Approximate package sizes (minified + gzipped):

| Package | Size | Purpose |
|---------|------|---------|
| `class-validator` | ~50KB | Validation decorators |
| `class-transformer` | ~20KB | Object transformation |
| `arctic` | ~30KB | OAuth providers |
| `jose` | ~25KB | JWT operations |
| `ajv` | ~45KB | JSON Schema validation |
| `@scalar/api-reference` | ~200KB | API documentation UI |
| `eta` | ~5KB | Template engine |

**Total if using all**: ~375KB  
**Core framework only**: ~50KB

By installing only what you need, you can significantly reduce your bundle size!

## Troubleshooting

### "Cannot find module" errors

**Solution**: Install the missing package shown in the error message.

### Reflection metadata errors

If using class-validator, ensure you have:
1. Installed `reflect-metadata`
2. Imported it at the top of your entry file:
   ```typescript
   import 'reflect-metadata';
   ```

### TypeScript errors

Ensure you have the type definitions installed:
```bash
bun add -d @types/node
```

## See Also

- [Validation Plugin Documentation](./validation.md)
- [Authentication Plugin Documentation](./auth.md)
- [JSON Parser Configuration](./json-parser-configuration.md)
