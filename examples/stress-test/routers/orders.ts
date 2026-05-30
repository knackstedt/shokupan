import { z } from 'zod';
import { validate } from '../../../src/plugins/middleware/validation';
import { ShokupanRouter } from '../../../src/router';
import { DatabaseService } from '../services/database';
import { NotificationService } from '../services/notification';
import { Container } from '../../../src/decorators';

export class OrdersRouter extends ShokupanRouter {
    private db = Container.resolve(DatabaseService);
    private notifications = Container.resolve(NotificationService);

    constructor() {
        super({ name: 'Orders API', group: 'orders' });

        // GET /orders
        this.get('/', {
            summary: 'List orders',
            tags: ['Orders']
        }, (ctx) => {
            const status = ctx.query.status;
            const page = parseInt(ctx.query.page || '1');
            const limit = Math.min(parseInt(ctx.query.limit || '20'), 100);
            let orders = this.db.getOrders();
            if (status) orders = orders.filter(o => o.status === status);
            const start = (page - 1) * limit;
            return ctx.json({
                orders: orders.slice(start, start + limit),
                total: orders.length,
                page,
                limit
            });
        });

        // GET /orders/:id
        this.get('/:id', {
            summary: 'Get order by ID',
            tags: ['Orders']
        }, (ctx) => {
            const order = this.db.getOrder(ctx.params.id);
            if (!order) return ctx.json({ error: 'Order not found' }, 404);
            return ctx.json({ order });
        });

        // POST /orders
        this.post('/', {
            summary: 'Create order',
            tags: ['Orders']
        }, validate({
            body: z.object({
                userId: z.string(),
                items: z.array(z.object({
                    productId: z.string(),
                    quantity: z.number().int().positive()
                })).min(1),
                status: z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']).default('pending')
            })
        }), async (ctx) => {
            const body = await ctx.body();
            let total = 0;
            for (const item of body.items) {
                const product = this.db.getProduct(item.productId);
                if (product) {
                    total += product.price * item.quantity;
                    product.inventory -= item.quantity;
                    this.db.updateProduct(item.productId, { inventory: product.inventory });
                }
            }
            const order = this.db.createOrder({
                id: `order-${Date.now()}`,
                userId: body.userId,
                items: body.items.map(i => ({ ...i, price: 0 })),
                status: body.status,
                total,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            this.notifications.send({
                id: `notif-${Date.now()}`,
                userId: body.userId,
                type: 'in_app',
                title: 'Order Created',
                body: `Your order ${order.id} has been created`,
                read: false,
                createdAt: new Date()
            });
            return ctx.json({ order }, 201);
        });

        // PUT /orders/:id
        this.put('/:id', {
            summary: 'Update order',
            tags: ['Orders']
        }, validate({
            body: z.object({
                status: z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']).optional(),
                items: z.array(z.object({
                    productId: z.string(),
                    quantity: z.number().int().positive()
                })).optional()
            })
        }), async (ctx) => {
            const body = await ctx.body();
            const order = this.db.updateOrder(ctx.params.id, body);
            if (!order) return ctx.json({ error: 'Order not found' }, 404);
            return ctx.json({ order });
        });

        // PATCH /orders/:id/status
        this.patch('/:id/status', {
            summary: 'Update order status',
            tags: ['Orders']
        }, validate({
            body: z.object({ status: z.enum(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']) })
        }), async (ctx) => {
            const body = await ctx.body();
            const order = this.db.updateOrder(ctx.params.id, { status: body.status });
            if (!order) return ctx.json({ error: 'Order not found' }, 404);
            this.notifications.send({
                id: `notif-${Date.now()}`,
                userId: order.userId,
                type: 'in_app',
                title: 'Order Updated',
                body: `Your order ${order.id} is now ${body.status}`,
                read: false,
                createdAt: new Date()
            });
            return ctx.json({ order });
        });

        // DELETE /orders/:id
        this.delete('/:id', {
            summary: 'Delete order',
            tags: ['Orders']
        }, (ctx) => {
            const deleted = this.db.deleteOrder(ctx.params.id);
            if (!deleted) return ctx.json({ error: 'Order not found' }, 404);
            return ctx.json({ deleted: true });
        });

        // GET /orders/:id/items
        this.get('/:id/items', {
            summary: 'Get order items',
            tags: ['Orders']
        }, (ctx) => {
            const order = this.db.getOrder(ctx.params.id);
            if (!order) return ctx.json({ error: 'Order not found' }, 404);
            return ctx.json({ items: order.items });
        });

        // POST /orders/:id/cancel
        this.post('/:id/cancel', {
            summary: 'Cancel order',
            tags: ['Orders']
        }, (ctx) => {
            const order = this.db.updateOrder(ctx.params.id, { status: 'cancelled' });
            if (!order) return ctx.json({ error: 'Order not found' }, 404);
            return ctx.json({ cancelled: true, order });
        });

        // GET /orders/stats
        this.get('/stats', {
            summary: 'Order statistics',
            tags: ['Orders', 'Analytics']
        }, (ctx) => {
            const orders = this.db.getOrders();
            const statusCounts = orders.reduce((acc, o) => {
                acc[o.status] = (acc[o.status] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            return ctx.json({
                total: orders.length,
                statusDistribution: statusCounts,
                totalRevenue: orders.reduce((sum, o) => sum + o.total, 0),
                avgOrderValue: orders.length ? orders.reduce((sum, o) => sum + o.total, 0) / orders.length : 0
            });
        });

        // GET /orders/by-date-range
        this.get('/by-date-range', {
            summary: 'Orders by date range',
            tags: ['Orders']
        }, (ctx) => {
            const from = ctx.query.from ? new Date(ctx.query.from) : new Date(0);
            const to = ctx.query.to ? new Date(ctx.query.to) : new Date();
            const orders = this.db.getOrders().filter(o => o.createdAt >= from && o.createdAt <= to);
            return ctx.json({ orders, from, to, count: orders.length });
        });
    }
}
