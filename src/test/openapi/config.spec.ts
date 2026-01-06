import { describe, expect, it, test } from "bun:test";
import { ShokupanRouter } from '../../router';
import { Controller, Get } from '../../util/decorators';

describe("OpenAPI Config & Groups", () => {
    describe("Configurable Defaults", () => {
        test("should use configured default tag group", async () => {
            const router = new ShokupanRouter();
            router.get("/hello", async () => "Hello");

            const spec = await router.generateApiSpec({
                defaultTagGroup: "MyGroup"
            });

            const tagGroups = spec["x-tagGroups"] as any[];
            const myGroup = tagGroups.find(g => g.name === "MyGroup");

            expect(myGroup).toBeDefined();
            // The default tag for the route should be "Application" (new default)
            expect(myGroup!.tags).toContain("Application");
        });

        test("should use configured default tag", async () => {
            const router = new ShokupanRouter();
            router.get("/hello", async () => "Hello");

            const spec = await router.generateApiSpec({
                defaultTag: "MyTag"
            });

            const getOp = spec.paths!["/hello"].get!;
            expect(getOp.tags).toContain("MyTag");
            expect(getOp.tags).not.toContain("Application");

            // Should still use "General" as default group
            const tagGroups = spec["x-tagGroups"] as any[];
            const generalGroup = tagGroups.find(g => g.name === "General");
            expect(generalGroup).toBeDefined();
            expect(generalGroup!.tags).toContain("MyTag");
        });

        test("should use both configured default group and tag", async () => {
            const router = new ShokupanRouter();
            router.get("/hello", async () => "Hello");

            const spec = await router.generateApiSpec({
                defaultTagGroup: "CustomGroup",
                defaultTag: "CustomTag"
            });

            const getOp = spec.paths!["/hello"].get!;
            expect(getOp.tags).toContain("CustomTag");

            const tagGroups = spec["x-tagGroups"] as any[];
            const customGroup = tagGroups.find(g => g.name === "CustomGroup");
            expect(customGroup).toBeDefined();
            expect(customGroup!.tags).toContain("CustomTag");
        });

        test("should use default values if options not provided", async () => {
            const router = new ShokupanRouter();
            router.get("/hello", async () => "Hello");

            const spec = await router.generateApiSpec();

            const getOp = spec.paths!["/hello"].get!;
            expect(getOp.tags).toContain("Application"); // New default

            const tagGroups = spec["x-tagGroups"] as any[];
            const generalGroup = tagGroups.find(g => g.name === "General");
            expect(generalGroup).toBeDefined();
            expect(generalGroup!.tags).toContain("Application");
        });
    });

    describe("x-tagGroups Generation", () => {
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

        it('should generate x-tagGroups with default group for unnamed routers', async () => {
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

            const spec = await root.generateApiSpec();

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

        it('should generate separated x-tagGroups for named routers with explicit group', async () => {
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

            const spec = await root.generateApiSpec();

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

        it('should group nested routers as tags within parent group if name is set but group is not', async () => {
            const root = new ShokupanRouter({
                group: "Main API"
            });

            const userRouter = new ShokupanRouter({
                name: "Users" // Name only -> Should be a Tag in "Main API"
            });
            // Add a route to userRouter manually to verify tag assignment
            userRouter.get('/', () => { });

            root.mount('/users', userRouter);

            const spec = await root.generateApiSpec();
            const groups = spec['x-tagGroups'] as Array<{ name: string, tags: string[]; }>;

            const mainGroup = groups.find(g => g.name === 'Main API');
            expect(mainGroup).toBeDefined();
            expect(mainGroup?.tags).toContain('Users');

            // Should NOT have a group named "Users"
            const userGroup = groups.find(g => g.name === 'Users');
            expect(userGroup).toBeUndefined();
        });

        it('should automatically infer tag name from mount path if name is missing', async () => {
            const root = new ShokupanRouter({
                group: "Auto Grouping"
            });

            const adminRouter = new ShokupanRouter(); // No name provided
            adminRouter.get('/dashboard', () => { });

            // Mount at /admin -> Should infer tag "Admin"
            root.mount('/admin', adminRouter);

            const spec = await root.generateApiSpec();
            const groups = spec['x-tagGroups'] as Array<{ name: string, tags: string[]; }>;

            const mainGroup = groups.find(g => g.name === 'Auto Grouping');
            expect(mainGroup).toBeDefined();
            expect(mainGroup?.tags).toContain('Admin');
        });
    });
});
