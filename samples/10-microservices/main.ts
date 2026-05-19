import { Shokupan } from 'shokupan';

/**
 * Sample 10: Microservices with HTTP Bridge
 *
 * Demonstrates the HTTP bridge for making internal sub-requests
 * between services without network overhead.
 */

// ===== Service A: User Service (port 3010) =====
const userService = new Shokupan({ port: 3010 });

const users = [
    { id: '1', name: 'Alice', email: 'alice@example.com' },
    { id: '2', name: 'Bob', email: 'bob@example.com' }
];

userService.get('/health', () => ({ status: 'ok', service: 'user-service' }));
userService.get('/users', () => ({ users }));
userService.get('/users/:id', (ctx) => {
    const user = users.find(u => u.id === ctx.params.id);
    if (!user) return ctx.json({ error: 'User not found' }, 404);
    return { user };
});

// ===== Service B: Order Service (port 3011) =====
const orderService = new Shokupan({ port: 3011 });

const orders = [
    { id: '101', userId: '1', total: 99.99, items: ['Book', 'Pen'] },
    { id: '102', userId: '2', total: 45.50, items: ['Coffee'] }
];

orderService.get('/health', () => ({ status: 'ok', service: 'order-service' }));
orderService.get('/orders', () => ({ orders }));
orderService.get('/orders/:id', (ctx) => {
    const order = orders.find(o => o.id === ctx.params.id);
    if (!order) return ctx.json({ error: 'Order not found' }, 404);
    return { order };
});

// ===== Gateway Service (port 3012) =====
// This service aggregates data from other services using the HTTP bridge
const gateway = new Shokupan({ port: 3012 });

gateway.get('/health', () => ({ status: 'ok', service: 'gateway' }));

// Aggregate user + orders using internal request
gateway.get('/users/:id/orders', async (ctx) => {
    const userId = ctx.params.id;

    // Internal sub-request to user service
    const userResponse = await userService.internalRequest({
        path: `/users/${userId}`,
        method: 'GET'
    });
    const userData = await userResponse.json() as any;

    if (userData.error) {
        return ctx.json({ error: 'User not found' }, 404);
    }

    // Filter orders for this user
    const userOrders = orders.filter(o => o.userId === userId);

    return {
        user: userData.user,
        orders: userOrders,
        totalSpent: userOrders.reduce((sum, o) => sum + o.total, 0)
    };
});

// Dashboard endpoint — aggregates all data
gateway.get('/dashboard', async () => {
    const allUsers = await (await userService.internalRequest({
        path: '/users',
        method: 'GET'
    })).json() as any;

    return {
        totalUsers: allUsers.users?.length || 0,
        totalOrders: orders.length,
        revenue: orders.reduce((sum, o) => sum + o.total, 0),
        services: {
            userService: 'up',
            orderService: 'up'
        }
    };
});

// Start all services
await userService.listen();
await orderService.listen();
await gateway.listen();

console.log('');
console.log('=== Microservices Architecture ===');
console.log('User Service:   http://localhost:3010');
console.log('Order Service:  http://localhost:3011');
console.log('Gateway:        http://localhost:3012');
console.log('');
console.log('Gateway endpoints:');
console.log('  GET /dashboard');
console.log('  GET /users/:id/orders');
