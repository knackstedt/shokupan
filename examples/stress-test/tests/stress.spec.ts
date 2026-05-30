import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Shokupan } from '../../../src/shokupan';
import { ApiRouter } from '../routers/api';
import { AdminController } from '../controllers/admin-controller';
import { NotificationController } from '../controllers/notification-controller';
import { createWebSocketRouter } from '../websocket/events';

describe('Shokupan Stress Test Server', () => {
    let app: Shokupan;
    let baseUrl: string;

    beforeAll(async () => {
        app = new Shokupan({
            port: 0,
            development: false,
            enableOpenApiGen: false,
            enableAsyncApiGen: false,
            enableWebSocketTracking: false,
            enableMiddlewareTracking: false,
        });

        app.get('/', (ctx) => ctx.json({ name: 'stress-test' }));
        app.get('/health', (ctx) => ctx.json({ status: 'healthy' }));
        app.get('/dynamic/:a/:b/:c', (ctx) => ctx.json({ params: ctx.params, query: ctx.query }));
        app.mount('/api/v1', new ApiRouter());
        app.mount('/', new AdminController());
        app.mount('/notifications', new NotificationController());
        app.mount('/ws', createWebSocketRouter());

        const server = await app.listen();
        baseUrl = `http://localhost:${server.port}`;
    });

    afterAll(async () => {
        await app.stop();
    });

    describe('Health & Root', () => {
        it('should return root info', async () => {
            const res = await fetch(`${baseUrl}/`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.name).toBe('stress-test');
        });

        it('should return health status', async () => {
            const res = await fetch(`${baseUrl}/health`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe('healthy');
        });
    });

    describe('Users API', () => {
        it('should list users', async () => {
            const res = await fetch(`${baseUrl}/api/v1/users`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(Array.isArray(data.users)).toBe(true);
            expect(data.total).toBeGreaterThan(0);
        });

        it('should get user by id', async () => {
            const res = await fetch(`${baseUrl}/api/v1/users/user-1`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.user.id).toBe('user-1');
        });

        it('should create a user', async () => {
            const res = await fetch(`${baseUrl}/api/v1/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Test', email: 'test@example.com', role: 'user' })
            });
            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.user.name).toBe('Test');
        });

        it('should update a user', async () => {
            const res = await fetch(`${baseUrl}/api/v1/users/user-1`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Updated' })
            });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.user.name).toBe('Updated');
        });

        it('should delete a user', async () => {
            const res = await fetch(`${baseUrl}/api/v1/users/user-20`, { method: 'DELETE' });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.deleted).toBe(true);
        });

        it('should search users', async () => {
            const res = await fetch(`${baseUrl}/api/v1/users/search?q=User`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(Array.isArray(data.users)).toBe(true);
        });

        it('should return user stats', async () => {
            const res = await fetch(`${baseUrl}/api/v1/users/stats`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(typeof data.total).toBe('number');
        });
    });

    describe('Products API', () => {
        it('should list products', async () => {
            const res = await fetch(`${baseUrl}/api/v1/products`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(Array.isArray(data.products)).toBe(true);
        });

        it('should get product by id', async () => {
            const res = await fetch(`${baseUrl}/api/v1/products/product-1`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.product.id).toBe('product-1');
        });

        it('should create a product', async () => {
            const res = await fetch(`${baseUrl}/api/v1/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Test Product', description: 'Test', price: 99.99, category: 'test' })
            });
            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.product.name).toBe('Test Product');
        });

        it('should filter products by category', async () => {
            const res = await fetch(`${baseUrl}/api/v1/products?category=clothing`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.filters.category).toBe('clothing');
        });

        it('should return product categories', async () => {
            const res = await fetch(`${baseUrl}/api/v1/products/categories`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(Array.isArray(data.categories)).toBe(true);
        });

        it('should search products', async () => {
            const res = await fetch(`${baseUrl}/api/v1/products/search?q=Product`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(Array.isArray(data.products)).toBe(true);
        });
    });

    describe('Orders API', () => {
        it('should list orders', async () => {
            const res = await fetch(`${baseUrl}/api/v1/orders`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(Array.isArray(data.orders)).toBe(true);
        });

        it('should get order by id', async () => {
            const res = await fetch(`${baseUrl}/api/v1/orders/order-1`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.order.id).toBe('order-1');
        });

        it('should create an order', async () => {
            const res = await fetch(`${baseUrl}/api/v1/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: 'user-1', items: [{ productId: 'product-1', quantity: 1 }] })
            });
            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.order.userId).toBe('user-1');
        });

        it('should cancel an order', async () => {
            const res = await fetch(`${baseUrl}/api/v1/orders/order-2/cancel`, { method: 'POST' });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.cancelled).toBe(true);
        });

        it('should return order stats', async () => {
            const res = await fetch(`${baseUrl}/api/v1/orders/stats`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(typeof data.total).toBe('number');
        });
    });

    describe('Inventory API', () => {
        it('should get all inventory', async () => {
            const res = await fetch(`${baseUrl}/api/v1/inventory`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(Array.isArray(data.inventory)).toBe(true);
        });

        it('should adjust inventory', async () => {
            const res = await fetch(`${baseUrl}/api/v1/inventory/product-1/adjust`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity: 5 })
            });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.adjustment).toBe(5);
        });

        it('should return inventory valuation', async () => {
            const res = await fetch(`${baseUrl}/api/v1/inventory/valuation`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(typeof data.totalValue).toBe('number');
        });
    });

    describe('Analytics API', () => {
        it('should return dashboard metrics', async () => {
            const res = await fetch(`${baseUrl}/api/v1/analytics/dashboard`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(typeof data.metrics.totalUsers).toBe('number');
        });

        it('should return user analytics', async () => {
            const res = await fetch(`${baseUrl}/api/v1/analytics/users`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(typeof data.total).toBe('number');
        });

        it('should return sales analytics', async () => {
            const res = await fetch(`${baseUrl}/api/v1/analytics/sales`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(typeof data.totalOrders).toBe('number');
        });
    });

    describe('Admin Controller', () => {
        it('should return admin dashboard', async () => {
            const res = await fetch(`${baseUrl}/admin/dashboard`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(typeof data.users).toBe('number');
        });

        it('should return cache stats', async () => {
            const res = await fetch(`${baseUrl}/admin/cache/stats`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(Array.isArray(data.keys)).toBe(true);
        });

        it('should clear cache', async () => {
            const res = await fetch(`${baseUrl}/admin/cache/clear`, { method: 'POST' });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.cleared).toBe(true);
        });

        it('should return system health', async () => {
            const res = await fetch(`${baseUrl}/admin/system/health`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(typeof data.uptime).toBe('number');
        });
    });

    describe('Notification Controller', () => {
        it('should create notification', async () => {
            const res = await fetch(`${baseUrl}/notifications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: 'user-1', title: 'Test', body: 'Hello' })
            });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.notification.title).toBe('Test');
        });

        it('should list notifications for user', async () => {
            const res = await fetch(`${baseUrl}/notifications?userId=user-1`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(Array.isArray(data.notifications)).toBe(true);
        });
    });

    describe('Query String Parsing', () => {
        it('should return empty query for URL without params', async () => {
            const res = await fetch(`${baseUrl}/dynamic/a/b/c`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(Object.keys(data.query).length).toBe(0);
        });
    });
});
