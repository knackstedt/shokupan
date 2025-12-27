
import { describe, expect, it } from 'bun:test';
import { Controller, Get } from '../decorators';
import { ShokupanRouter } from '../router';

// Mock classes for testing hierarchy
@Controller('/auth')
class AuthController {
    @Get('/login')
    login() { }
}

@Controller('/posts')
class PostsController {
    @Get('/')
    list() { }
}

@Controller('/users')
class UsersController {
    @Get('/')
    list() { }
}

describe('OpenAPI x-tagGroups Generation', () => {
    it('should generate x-tagGroups with default group for unnamed routers', () => {
        const root = new ShokupanRouter({
            openapi: {
                info: { title: 'Test API', version: '1.0.0' }
            }
        });

        const apiRouter = new ShokupanRouter();

        root.mount('/auth', AuthController);

        apiRouter.mount('/posts', PostsController);
        apiRouter.mount('/users', UsersController);

        root.mount('/api', apiRouter);

        const spec = root.generateApiSpec();

        // Validation
        expect(spec['x-tagGroups']).toBeDefined();
        const groups = spec['x-tagGroups'] as Array<{ name: string, tags: string[]; }>;

        // Everything should fall into "General" because we haven't named the routers
        const generalGroup = groups.find(g => g.name === 'General');
        expect(generalGroup).toBeDefined();
        expect(generalGroup?.tags).toContain('AuthController');
        expect(generalGroup?.tags).toContain('PostsController');
        expect(generalGroup?.tags).toContain('UsersController');
    });

    it('should generate separated x-tagGroups for named routers with explicit group', () => {
        const root = new ShokupanRouter({
            name: "Core Services",
            group: "Core Services",
            openapi: {
                info: { title: 'Test API', version: '1.0.0' }
            }
        });

        const apiRouter = new ShokupanRouter({
            name: "Content API",
            group: "Content API"
        });

        root.mount('/auth', AuthController);

        apiRouter.mount('/posts', PostsController);
        apiRouter.mount('/users', UsersController);

        root.mount('/api', apiRouter);

        const spec = root.generateApiSpec();

        // Validation
        const groups = spec['x-tagGroups'] as Array<{ name: string, tags: string[]; }>;

        const coreGroup = groups.find(g => g.name === 'Core Services');
        expect(coreGroup).toBeDefined();
        expect(coreGroup?.tags).toContain('AuthController');
        expect(coreGroup?.tags).not.toContain('PostsController');

        const contentGroup = groups.find(g => g.name === 'Content API');
        expect(contentGroup).toBeDefined();
        expect(contentGroup?.tags).toContain('PostsController');
        expect(contentGroup?.tags).toContain('UsersController');
    });

    it('should group nested routers as tags within parent group if name is set but group is not', () => {
        const root = new ShokupanRouter({
            group: "Main API"
        });

        const userRouter = new ShokupanRouter({
            name: "Users" // Name only -> Should be a Tag in "Main API"
        });
        // Add a route to userRouter manually to verify tag assignment
        userRouter.get('/', () => { });

        root.mount('/users', userRouter);

        const spec = root.generateApiSpec();
        const groups = spec['x-tagGroups'] as Array<{ name: string, tags: string[]; }>;

        const mainGroup = groups.find(g => g.name === 'Main API');
        expect(mainGroup).toBeDefined();
        expect(mainGroup?.tags).toContain('Users');

        // Should NOT have a group named "Users"
        const userGroup = groups.find(g => g.name === 'Users');
        expect(userGroup).toBeUndefined();
    });

    it('should automatically infer tag name from mount path if name is missing', () => {
        const root = new ShokupanRouter({
            group: "Auto Grouping"
        });

        const adminRouter = new ShokupanRouter(); // No name provided
        adminRouter.get('/dashboard', () => { });

        // Mount at /admin -> Should infer tag "Admin"
        root.mount('/admin', adminRouter);

        const spec = root.generateApiSpec();
        const groups = spec['x-tagGroups'] as Array<{ name: string, tags: string[]; }>;

        const mainGroup = groups.find(g => g.name === 'Auto Grouping');
        expect(mainGroup).toBeDefined();
        expect(mainGroup?.tags).toContain('Admin');
    });
});
