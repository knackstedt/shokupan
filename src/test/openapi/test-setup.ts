import { ShokupanContext } from '../../context';
import { ScalarPlugin } from '../../plugins/application/scalar';
import { ShokupanRouter } from '../../router';
import { Shokupan } from '../../shokupan';
import { $controllerPath, $routeMethods } from '../../util/symbol';

// Mock Controller Decorator for testing "Bindings"
function Controller(path: string) {
    return function (target: any) {
        target[$controllerPath] = path;
    };
}

function Get(path: string) {
    return function (target: any, propertyKey: string) {
        if (!target[$routeMethods]) target[$routeMethods] = new Map();
        target[$routeMethods].set(propertyKey, { method: "GET", path });
    };
}

@Controller("/users")
class UserController {
    @Get("/")
    async getUsers(ctx: ShokupanContext) {
        return [{ id: 1, name: "Alice" }];
    }

    @Get("/:id")
    async getUser(ctx: ShokupanContext) {
        return { id: ctx.params['id'], name: "Alice" };
    }
}

// Plain object binding
const AuthBinding = {
    // Should map to GET /auth/login
    async getLogin(ctx: ShokupanContext) {
        return "Login Page";
    },
    // Should map to POST /auth/login
    async postLogin(ctx: ShokupanContext) {
        return { token: "abc" };
    }
};

let sharedSpecPromise: Promise<any> | null = null;

export function getSharedSpec() {
    if (!sharedSpecPromise) {
        sharedSpecPromise = generateSharedSpec();
    }
    return sharedSpecPromise;
}

async function generateSharedSpec() {
    const app = new Shokupan();

    // --- Inference Tests ---

    // Parameter Detection
    app.post('/inference/params/users', async (ctx) => {
        const body = await ctx.body();
        return { created: true, data: body };
    });

    app.get('/inference/params/search', (ctx) => {
        const query = ctx.query['q'];
        return { results: [], query };
    });

    app.get('/inference/params/protected', (ctx) => {
        const auth = ctx.get('Authorization');
        return { authenticated: !!auth };
    });

    // Response Detection
    app.get('/inference/response/json', (ctx) => {
        return ctx.json({ data: 'test' });
    });

    app.get('/inference/response/html', (ctx) => {
        return ctx.html('<html><body>Hello</body></html>');
    });

    app.get('/inference/response/text', (ctx) => {
        return ctx.text('Hello, World!');
    });

    app.get('/inference/response/jsx', (ctx) => {
        return ctx.jsx({ type: 'div', props: null, children: [] });
    });

    app.get('/inference/response/file', (ctx) => {
        return ctx.file('/path/to/file.pdf');
    });

    app.get('/inference/response/redirect', (ctx) => {
        return ctx.redirect('/new-path');
    });

    app.get('/inference/response/redirect-301', (ctx) => {
        return ctx.redirect('/new-location', 301);
    });

    app.get('/inference/response/redirect-307', (ctx) => {
        return ctx.redirect('/temp-location', 307);
    });

    app.post('/inference/response/error', (ctx) => {
        if (!ctx.query['value']) {
            return ctx.json({ error: 'Missing value' }, 400);
        }
        return ctx.json({ success: true });
    });

    // Type Detection
    app.get('/inference/types/items', (ctx) => {
        const page = parseInt(ctx.query['page']);
        const limit = parseInt(ctx.query['limit']);
        return { page, limit };
    });

    app.get('/inference/types/calculate', (ctx) => {
        const price = parseFloat(ctx.query['price']);
        const tax = parseFloat(ctx.query['tax']);
        return { total: price + tax };
    });

    app.get('/inference/types/math', (ctx) => {
        const value = Number(ctx.query['value']);
        return { result: value * 2 };
    });

    app.get('/inference/types/filter', (ctx) => {
        const active = Boolean(ctx.query['active']);
        return { active };
    });

    app.get('/inference/types/check', (ctx) => {
        const enabled = !!ctx.query['enabled'];
        return { enabled };
    });

    app.get('/inference/types/search-default', (ctx) => {
        const query = ctx.query['q'];
        return { query };
    });

    app.get('/inference/types/users/:id', (ctx) => {
        const id = parseInt(ctx.params['id']);
        return { user: { id } };
    });

    app.get('/inference/types/products', (ctx) => {
        const category = ctx.query['category']; // string
        const minPrice = parseFloat(ctx.query['minPrice']); // number
        const inStock = Boolean(ctx.query['inStock']); // boolean
        const limit = parseInt(ctx.query['limit']); // integer
        return { category, minPrice, inStock, limit };
    });

    app.get('/inference/types/mixed', (ctx) => {
        // First access as string, then convert to int
        const rawPage = ctx.query['page'];
        const page = parseInt(ctx.query['page']);
        return { rawPage, page };
    });

    // Decorators
    app.get('/inference/decorators/items',
        {
            summary: 'Get items',
            description: 'Retrieves a list of items'
        },
        (ctx) => {
            const search = ctx.query['search'];
            return { items: [], search };
        }
    );

    // Mounted Routers (Inference)
    const inferenceApiRouter = new ShokupanRouter();
    inferenceApiRouter.get('/users', (ctx) => {
        const role = ctx.query['role'];
        return { users: [], role };
    });
    app.mount('/inference/mount/api', inferenceApiRouter);

    // Built-in Type Tests
    app.get('/large-json', ctx => ctx.json(performance));
    app.get('/large-json2', ctx => ctx.json(process.env));
    app.get('/json3', ctx => ctx.json({ message: process.env['FOO'] || 'bar' }));
    app.get('/json4', ctx => ctx.json({ message: process.env['FOO'] || 'bar' }));


    // --- Generation Tests ---

    // Basic router generation
    const genRouter = new ShokupanRouter();
    genRouter.get("/users/:id", {
        summary: "Get User",
        responses: {
            200: { description: "User found" }
        }
    }, (ctx) => ({ id: ctx.params['id'] }));
    app.mount('/generation/basic', genRouter);

    // Guard merging
    // Note: Since we are mounting this onto the main app, the router itself isn't generating the spec safely in isolation,
    // but the main app spec will contain it. 
    // The test in generation.spec.ts tested `router.generateApiSpec()`.
    // We can simulate this by checking the paths in the main spec.
    const guardRouter = new ShokupanRouter();
    guardRouter.guard({
        security: [{ bearerAuth: [] }],
        responses: {
            401: { description: "Unauthorized" }
        }
    }, async (ctx, next) => next && next());

    guardRouter.post("/secure", (ctx) => "ok");
    app.mount('/generation/guard', guardRouter);

    // Nested routers
    const root = new ShokupanRouter();
    const api = new ShokupanRouter();
    const users = new ShokupanRouter();
    users.get("/:userId/posts", (ctx) => []);
    api.mount("/users", users);
    root.mount("/api/v1", api);
    app.mount('/generation/nested', root);


    // --- Integration Tests ---

    // 1. Basic Routes
    app.get("/integration/health", { summary: "Health Check", responses: { 200: { description: "Successful response" } } }, () => "OK");
    app.post("/integration/submit", { summary: "Submit Data", responses: { 200: { description: "Successful response" } } }, () => "Received");

    // 2. Guards
    const adminRouter = new ShokupanRouter();
    adminRouter.guard({
        description: "Admin Guard",
        security: [{ bearerAuth: [] }]
    }, async (ctx, next) => next && next());

    adminRouter.get("/dashboard", { summary: "Admin Dashboard", responses: { 200: { description: "Successful response" } } }, () => "Dashboard");
    app.mount("/integration/admin", adminRouter);

    // 3. Mounted Controller (Class)
    // Mount at /integration/api
    app.mount("/integration/api", UserController);

    // 4. Mounted Bindings (Object)
    app.mount("/integration/auth", AuthBinding as any);

    // 5. Scalar Plugin
    // Note: The original test verified `app.internalRequest("/docs/openapi.json")`.
    // The shared spec is just the JSON object.
    // To verify Scalar Plugin integration in the shared spec, we only check if the plugin routes are registered?
    // ScalarPlugin doesn't register routes in the OpenAPI spec itself usually (it SERVES the spec).
    // But the test checked `spec.paths["/app-root"]`.
    // Wait, the test `should generate full spec from ScalarPlugin mount` did:
    // app.mount("/docs", plugin);
    // response = await app.internalRequest("/docs/openapi.json");
    // expect((spec as any).paths["/app-root"]).toBeDefined();
    // This confirms that the spec served by Scalar *contains* the app's routes.
    // This is checking runtime behavior of the plugin serving the spec.
    // We can't easily mock this with `getSharedSpec` which returns the JSON directly.
    // However, we can add a ScalarPlugin to the shared app to verify it doesn't crash the generation.
    const plugin = new ScalarPlugin({
        baseDocument: { info: { title: "Test", version: "1" } },
        config: {}
    });
    app.mount("/integration/docs", plugin);

    return await app.generateApiSpec();
}
