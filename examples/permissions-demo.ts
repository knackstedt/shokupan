import { AuthPlugin } from '../src/plugins/application/auth';
import { PermissionPlugin } from '../src/plugins/application/permissions';
import { Shokupan } from '../src/shokupan';

const app = new Shokupan();

const permissionPlugin = new PermissionPlugin({
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
                { resource: 'posts', action: 'delete' },
                { resource: 'dashboard', action: 'read' }
            ]
        },
        {
            name: 'viewer',
            description: 'Read-only access',
            permissions: [
                { resource: 'posts', action: 'read' },
                { resource: 'dashboard', action: 'read' }
            ],
            inherits: []
        },
        {
            name: 'moderator',
            description: 'Can moderate content',
            permissions: [
                { resource: 'posts', action: 'update' },
                { resource: 'posts', action: 'delete' },
                { resource: 'comments', action: '*' }
            ],
            inherits: ['viewer']
        }
    ],
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
    },
    onUnauthorized: async (ctx, check) => {
        return ctx.json({
            error: 'Forbidden',
            message: `Access denied: ${check.resource}:${check.action}`,
            requiredPermission: check
        }, 403);
    },
    enableWildcards: true,
    caseSensitive: false
});

const authPlugin = new AuthPlugin({
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    jwtExpiration: '24h',
    cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        path: '/'
    },
    successRedirect: '/dashboard',
    onSuccess: async (user, ctx) => {
        user.roles = ['viewer'];
        
        if (user.email?.endsWith('@admin.com')) {
            user.roles = ['admin'];
        } else if (user.email?.endsWith('@editor.com')) {
            user.roles = ['editor'];
        }
        
        user.permissions = ['profile:read', 'profile:update'];
    },
    providers: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID || '',
            clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
            redirectUri: 'http://localhost:3000/auth/github/callback'
        }
    }
});

app.use(authPlugin.getMiddleware());

app.register(authPlugin);
app.register(permissionPlugin);

app.get('/', (ctx) => {
    return ctx.json({
        message: 'Permission System Demo',
        endpoints: {
            auth: {
                login: '/auth/github/login',
                me: '/auth/me',
                logout: '/auth/logout'
            },
            permissions: {
                roles: '/permissions/roles',
                check: '/permissions/check?resource=posts&action=read',
                user: '/permissions/user'
            },
            protected: {
                dashboard: '/dashboard',
                posts: '/posts',
                admin: '/admin'
            }
        }
    });
});

app.get('/dashboard', 
    permissionPlugin.requirePermission('dashboard', 'read'),
    (ctx) => {
        const user = (ctx as any).user;
        return ctx.json({
            message: 'Welcome to the dashboard',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                roles: user.roles,
                permissions: user.permissions
            }
        });
    }
);

app.get('/posts', 
    permissionPlugin.requirePermission('posts', 'read'),
    (ctx) => {
        return ctx.json({
            posts: [
                { id: 1, title: 'First Post', content: 'Hello World' },
                { id: 2, title: 'Second Post', content: 'Lorem Ipsum' }
            ]
        });
    }
);

app.post('/posts',
    permissionPlugin.requirePermission('posts', 'create'),
    async (ctx) => {
        const body = await ctx.body();
        return ctx.json({
            message: 'Post created',
            post: body
        }, 201);
    }
);

app.delete('/posts/:id',
    permissionPlugin.requirePermission('posts', 'delete'),
    (ctx) => {
        return ctx.json({
            message: `Post ${ctx.params.id} deleted`
        });
    }
);

app.get('/admin',
    permissionPlugin.requireRole('admin'),
    (ctx) => {
        return ctx.json({
            message: 'Admin panel',
            adminFeatures: ['user-management', 'system-settings', 'analytics']
        });
    }
);

app.get('/editor',
    permissionPlugin.requireAnyPermission(
        { resource: 'posts', action: 'create' },
        { resource: 'posts', action: 'update' }
    ),
    (ctx) => {
        return ctx.json({
            message: 'Editor panel',
            tools: ['create-post', 'edit-post', 'media-library']
        });
    }
);

app.get('/profile',
    permissionPlugin.requireAllPermissions(
        { resource: 'profile', action: 'read' },
        { resource: 'profile', action: 'update' }
    ),
    (ctx) => {
        const user = (ctx as any).user;
        return ctx.json({
            profile: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    }
);

permissionPlugin.addCustomResolver('posts:update', async (user, check, ctx) => {
    const postId = ctx.params.id;
    
    const hasGeneralPermission = user.permissions?.some((p: any) => 
        p.resource === 'posts' && p.action === 'update'
    );
    
    if (hasGeneralPermission) {
        return true;
    }
    
    if (check.context?.ownerId === user.id) {
        return true;
    }
    
    return false;
});

app.put('/posts/:id',
    async (ctx, next) => {
        const body = await ctx.body();
        (ctx as any).postOwnerId = '123';
        return next();
    },
    permissionPlugin.requirePermission('posts', 'update', { ownerId: '123' }),
    (ctx) => {
        return ctx.json({
            message: `Post ${ctx.params.id} updated`
        });
    }
);

app.listen(3000, () => {
    console.log('🚀 Permission System Demo running on http://localhost:3000');
    console.log('\n📚 Available endpoints:');
    console.log('  GET  /                  - API overview');
    console.log('  GET  /auth/github/login - Login with GitHub');
    console.log('  GET  /auth/me           - Get current user');
    console.log('  POST /auth/logout       - Logout');
    console.log('  GET  /permissions/roles - List all roles');
    console.log('  GET  /permissions/user  - Get user permissions');
    console.log('  GET  /dashboard         - Dashboard (requires permission)');
    console.log('  GET  /posts             - List posts (requires read)');
    console.log('  POST /posts             - Create post (requires create)');
    console.log('  PUT  /posts/:id         - Update post (requires update or ownership)');
    console.log('  DEL  /posts/:id         - Delete post (requires delete)');
    console.log('  GET  /admin             - Admin panel (requires admin role)');
    console.log('  GET  /editor            - Editor panel (requires editor permissions)');
    console.log('  GET  /profile           - User profile (requires multiple permissions)');
});
