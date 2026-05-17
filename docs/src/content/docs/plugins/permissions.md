---
title: Permissions
description: Role-based access control with custom resolvers and context-aware checks
---

Shokupan provides a built-in permission system supporting Role-Based Access Control (RBAC), resource-based permissions, custom resolvers, and wildcard matching.

## Quick Start

```typescript
import { Shokupan, PermissionPlugin } from 'shokupan';

const app = new Shokupan();

const permissions = new PermissionPlugin({
    roles: [
        {
            name: 'admin',
            description: 'Administrator with full access',
            permissions: [
                { resource: '*', action: '*' }
            ]
        },
        {
            name: 'editor',
            description: 'Can create and edit content',
            permissions: [
                { resource: 'posts', action: 'create' },
                { resource: 'posts', action: 'read' },
                { resource: 'posts', action: 'update' },
                { resource: 'posts', action: 'delete' }
            ]
        },
        {
            name: 'viewer',
            description: 'Read-only access',
            permissions: [
                { resource: 'posts', action: 'read' }
            ]
        }
    ]
});

app.register(permissions);

app.get('/posts',
    permissions.requirePermission('posts', 'read'),
    (ctx) => {
        return ctx.json({ posts: [] });
    }
);

await app.listen();
```

:::note[Mount Path]
`app.register(permissions)` mounts the plugin at the root path by default. To mount at a subpath, pass an options object: `app.register(permissions, { path: '/api' })`. The built-in permission API endpoints will be prefixed accordingly.
:::

## Protecting Routes

### Require a Specific Permission

```typescript
app.get('/posts',
    permissions.requirePermission('posts', 'read'),
    (ctx) => {
        return ctx.json({ posts: [] });
    }
);
```

### Require a Role

```typescript
app.get('/admin',
    permissions.requireRole('admin'),
    (ctx) => {
        return ctx.json({ message: 'Admin panel' });
    }
);
```

### Require Any of Multiple Permissions

```typescript
app.get('/editor',
    permissions.requireAnyPermission(
        { resource: 'posts', action: 'create' },
        { resource: 'posts', action: 'update' }
    ),
    (ctx) => {
        return ctx.json({ message: 'Editor panel' });
    }
);
```

### Require All Permissions

```typescript
app.get('/profile',
    permissions.requireAllPermissions(
        { resource: 'profile', action: 'read' },
        { resource: 'profile', action: 'update' }
    ),
    (ctx) => {
        return ctx.json({ profile: {} });
    }
);
```

## Configuration

### PermissionConfig Options

```typescript
interface PermissionConfig {
    // Pre-defined roles
    roles?: Role[];

    // Custom permission resolvers
    customResolvers?: Map<string, PermissionResolver>;

    // Function to extract user permissions
    getUserPermissions?: (user: any, ctx: ShokupanContext) => Permission[] | Promise<Permission[]>;

    // Function to extract user roles
    getUserRoles?: (user: any, ctx: ShokupanContext) => string[] | Promise<string[]>;

    // Custom unauthorized handler
    onUnauthorized?: (ctx: ShokupanContext, check: PermissionCheck) => Response | Promise<Response>;

    // Enable wildcard matching (default: true)
    enableWildcards?: boolean;

    // Case-sensitive matching (default: false)
    caseSensitive?: boolean;
}
```

## Role Inheritance

Roles can inherit permissions from other roles:

```typescript
const permissions = new PermissionPlugin({
    roles: [
        {
            name: 'viewer',
            permissions: [
                { resource: 'posts', action: 'read' }
            ]
        },
        {
            name: 'moderator',
            permissions: [
                { resource: 'posts', action: 'update' },
                { resource: 'posts', action: 'delete' }
            ],
            inherits: ['viewer'] // Inherits read permission
        }
    ]
});
```

## Custom Permission Resolvers

Implement custom logic for dynamic permissions. Resolvers are checked before static permissions.

```typescript
// Resource-level resolver
permissions.addCustomResolver('posts', async (user, check, ctx) => {
    if (user.isAdmin) return true;
    return false;
});

// Action-level resolver
permissions.addCustomResolver('posts:update', async (user, check, ctx) => {
    const postId = ctx.params.id;

    const hasGeneralPermission = user.permissions?.some((p: any) =>
        p.resource === 'posts' && p.action === 'update'
    );

    if (hasGeneralPermission) return true;

    // Check ownership via context
    if (check.context?.ownerId === user.id) {
        return true;
    }

    return false;
});

// Global resolver (fallback)
permissions.addCustomResolver('*', async (user, check, ctx) => {
    return user.isSuperAdmin === true;
});
```

:::tip[Resolver Priority]
When checking a permission, resolvers are looked up in this order:
1. `{resource}:{action}` (action-level)
2. `{resource}` (resource-level)
3. `*` (global fallback)
:::

## Context-Aware Permissions

Pass runtime context for conditional permission checks using custom resolvers:

```typescript
permissions.addCustomResolver('posts:update', async (user, check, ctx) => {
    // check.context is passed from the middleware
    if (check.context?.ownerId === user.id) {
        return true;
    }
    return false;
});

app.put('/posts/:id',
    async (ctx, next) => {
        const post = await getPost(ctx.params.id);
        // Attach ownership context for the permission check
        (ctx as any).checkContext = { ownerId: post.ownerId };
        return next();
    },
    async (ctx, next) => {
        // Pass context at request time via a wrapper
        const user = (ctx as any).user;
        const hasPermission = await permissions.checkPermission(user, {
            resource: 'posts',
            action: 'update',
            context: (ctx as any).checkContext
        }, ctx);

        if (!hasPermission) {
            return ctx.json({ error: 'Forbidden' }, 403);
        }

        return next();
    },
    (ctx) => {
        return ctx.json({ message: 'Post updated' });
    }
);
```

Alternatively, check permissions directly in the route handler:

```typescript
app.put('/posts/:id', async (ctx) => {
    const post = await getPost(ctx.params.id);
    const user = (ctx as any).user;

    const canUpdate = await permissions.checkPermission(user, {
        resource: 'posts',
        action: 'update',
        context: { ownerId: post.ownerId }
    }, ctx);

    if (!canUpdate) {
        return ctx.json({ error: 'Forbidden' }, 403);
    }

    // Update post...
    return ctx.json({ message: 'Post updated' });
});
```

## Integration with Auth Plugin

The permission system integrates with the [Auth plugin](/plugins/authentication/):

```typescript
import { AuthPlugin, PermissionPlugin } from 'shokupan';

const auth = new AuthPlugin({
    jwtSecret: process.env.JWT_SECRET!,
    onSuccess: async (user, ctx) => {
        if (user.email?.endsWith('@admin.com')) {
            user.roles = ['admin'];
        } else {
            user.roles = ['viewer'];
        }

        user.permissions = ['profile:read', 'profile:update'];
    },
    providers: { /* ... */ }
});

const permissions = new PermissionPlugin({
    getUserPermissions: async (user, ctx) => {
        if (user.permissions && Array.isArray(user.permissions)) {
            return user.permissions.map((p: any) => {
                if (typeof p === 'string') {
                    const [resource, action] = p.split(':');
                    return { resource, action };
                }
                return p;
            });
        }
        return [];
    },
    getUserRoles: async (user, ctx) => {
        return user.roles || [];
    }
});

// Apply auth middleware globally
app.use(auth.getMiddleware());

app.register(auth);
app.register(permissions);
```

:::note[String Permissions]
The `getUserPermissions` callback is where string permissions like `'posts:read'` are parsed into objects. Role definitions in `PermissionConfig.roles` use the object format directly.
:::

## Permission Format

### Role Definitions (Object Format)

Roles and their permissions are defined as objects:

```typescript
{
    resource: 'posts',
    action: 'read',
    conditions?: { ownerId: '123' }
}
```

### User Permissions (String or Object Format)

User-level permissions passed through `getUserPermissions` can be strings and will be parsed automatically:

```typescript
// String format (parsed in getUserPermissions)
'posts:read'

// Object format (passed through as-is)
{ resource: 'posts', action: 'read' }
```

## Wildcard Patterns

When `enableWildcards` is `true` (default), you can use `*` and `?` in patterns:

| Pattern | Matches |
|---------|---------|
| `*` | Any value |
| `posts:*` | Any action on `posts` |
| `*:read` | `read` action on any resource |
| `doc?` | `doc1`, `doc2`, `docA`, etc. |

```typescript
{
    name: 'admin',
    permissions: [
        { resource: '*', action: '*' }  // All resources, all actions
    ]
}

{
    name: 'posts-manager',
    permissions: [
        { resource: 'posts', action: '*' }  // All actions on posts
    ]
}
```

## Built-in API Endpoints

The plugin exposes RESTful endpoints relative to its mount path:

### GET /permissions/roles

List all defined roles and their permissions.

```bash
curl http://localhost:3000/permissions/roles
```

### GET /permissions/check

Check if the current user has a specific permission.

```bash
curl "http://localhost:3000/permissions/check?resource=posts&action=read" \
  -H "Cookie: auth_token=..."
```

### GET /permissions/user

Get the current user's permissions and roles.

```bash
curl http://localhost:3000/permissions/user \
  -H "Cookie: auth_token=..."
```

## Custom Unauthorized Handler

Customize the response when permission checks fail:

```typescript
const permissions = new PermissionPlugin({
    onUnauthorized: async (ctx, check) => {
        return ctx.json({
            error: 'Access Denied',
            message: `You don't have permission to ${check.action} ${check.resource}`,
            requiredPermission: check
        }, 403);
    }
});
```

## Programmatic Permission Checks

Check permissions directly in your handlers:

```typescript
app.get('/conditional', async (ctx) => {
    const user = (ctx as any).user;

    const canEdit = await permissions.checkPermission(
        user,
        { resource: 'posts', action: 'update' },
        ctx
    );

    return ctx.json({
        message: 'Resource',
        canEdit
    });
});
```

## Managing Roles Dynamically

Add or remove roles at runtime:

```typescript
// Add a new role
permissions.addRole({
    name: 'contributor',
    description: 'Can contribute content',
    permissions: [
        { resource: 'posts', action: 'create' },
        { resource: 'posts', action: 'read' }
    ]
});

// Remove a role
permissions.removeRole('contributor');

// Get role details
const role = permissions.getRole('admin');
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type { Permission, Role, PermissionCheck, PermissionResolver, PermissionConfig } from 'shokupan';

const role: Role = {
    name: 'admin',
    permissions: [
        { resource: 'posts', action: 'read' }
    ]
};
```

## Security Best Practices

:::caution[Security]
- Grant only the minimum permissions needed (principle of least privilege)
- Group permissions into roles for easier management
- Leverage inheritance to avoid duplication
- Use custom resolvers for complex, dynamic permission logic
- Pass context for ownership-based permissions
- Log permission checks for security auditing
- Default to denying access when in doubt
- Ensure custom resolver logic is secure and tested
:::

## Next Steps

- [Authentication](/plugins/authentication/) - OAuth2 support
- [Sessions](/plugins/sessions/) - Session management
- [Rate Limiting](/plugins/rate-limiting/) - Protect permission endpoints
