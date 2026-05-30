import { Cors, Proxy, RateLimitMiddleware, Shokupan } from '../src/index';

/**
 * Sample 6: API Gateway with Proxy
 * Tests: Proxy middleware, route aggregation, service discovery
 */

// Backend service simulation
const userService = new Shokupan({ port: 3106, development: false });
userService.get('/users', () => ({ users: [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }] }));
userService.get('/users/:id', (ctx) => ({ user: { id: ctx.params.id, name: 'User ' + ctx.params.id } }));
await userService.listen();

const orderService = new Shokupan({ port: 3107, development: false });
orderService.get('/orders', () => ({ orders: [{ id: '101', total: 99.99 }, { id: '102', total: 45.50 }] }));
orderService.get('/orders/:id', (ctx) => ({ order: { id: ctx.params.id, total: 99.99 } }));
await orderService.listen();

// Gateway
const gateway = new Shokupan({
    port: 3108,
    development: true,
    enableOpenApiGen: true
});

gateway.use(Cors({ origin: '*' }));
gateway.use(RateLimitMiddleware({ windowMs: 60000, max: 100 }));

// Health
gateway.get('/health', () => ({ status: 'ok', service: 'gateway' }));

// Proxy to backend services
gateway.use('/api/users', Proxy({ target: 'http://localhost:3106', changeOrigin: true, pathRewrite: (path) => path.replace(/^\/api\/users/, '/users') }));
gateway.use('/api/orders', Proxy({ target: 'http://localhost:3107', changeOrigin: true, pathRewrite: (path) => path.replace(/^\/api\/orders/, '/orders') }));

// Aggregate endpoint
gateway.get('/dashboard', async (ctx) => {
    const users = await (await fetch('http://localhost:3106/users')).json();
    const orders = await (await fetch('http://localhost:3107/orders')).json();
    return {
        stats: {
            totalUsers: (users as any).users?.length || 0,
            totalOrders: (orders as any).orders?.length || 0,
            revenue: (orders as any).orders?.reduce((s: number, o: any) => s + o.total, 0) || 0
        }
    };
});

await gateway.listen();
console.log('Gateway running on https://localhost:3108');
console.log('  /api/users -> http://localhost:3106');
console.log('  /api/orders -> http://localhost:3107');
