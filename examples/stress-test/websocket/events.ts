import { ShokupanWebsocketRouter } from '../../../src/websocket';
import { DatabaseService } from '../services/database';
import { NotificationService } from '../services/notification';
import { Container } from '../../../src/decorators';

export function createWebSocketRouter() {
    const db = Container.resolve(DatabaseService);
    const notifications = Container.resolve(NotificationService);
    const wsRouter = new ShokupanWebsocketRouter();

    // Connection lifecycle events
    wsRouter.event('connection.ping', (ctx) => {
        ctx.emit('connection.pong', { timestamp: Date.now() });
    });

    wsRouter.event('connection.status', (ctx) => {
        ctx.emit('connection.status.response', {
            connected: true,
            uptime: process.uptime(),
            timestamp: Date.now()
        });
    });

    wsRouter.event('connection.heartbeat', (ctx) => {
        ctx.emit('connection.heartbeat.ack', { received: true });
    });

    // User events (5)
    wsRouter.event('user.list', (ctx) => {
        ctx.emit('user.list.response', { users: db.getUsers() });
    });

    wsRouter.event('user.get', async (ctx) => {
        const data = await ctx.body();
        const user = db.getUser(data.userId);
        ctx.emit('user.get.response', { user });
    });

    wsRouter.event('user.create', async (ctx) => {
        const data = await ctx.body();
        const user = db.createUser({
            id: `user-${Date.now()}`,
            name: data.name,
            email: data.email,
            role: data.role || 'user',
            createdAt: new Date()
        });
        ctx.emit('user.create.response', { user });
        ctx.broadcast('user.created', { user });
    });

    wsRouter.event('user.update', async (ctx) => {
        const data = await ctx.body();
        const user = db.updateUser(data.userId, data.updates);
        ctx.emit('user.update.response', { user });
        ctx.broadcast('user.updated', { user });
    });

    wsRouter.event('user.delete', async (ctx) => {
        const data = await ctx.body();
        const deleted = db.deleteUser(data.userId);
        ctx.emit('user.delete.response', { deleted });
        ctx.broadcast('user.deleted', { userId: data.userId });
    });

    // Product events (5)
    wsRouter.event('product.list', (ctx) => {
        ctx.emit('product.list.response', { products: db.getProducts() });
    });

    wsRouter.event('product.get', async (ctx) => {
        const data = await ctx.body();
        const product = db.getProduct(data.productId);
        ctx.emit('product.get.response', { product });
    });

    wsRouter.event('product.create', async (ctx) => {
        const data = await ctx.body();
        const product = db.createProduct({
            id: `product-${Date.now()}`,
            name: data.name,
            description: data.description,
            price: data.price,
            category: data.category,
            inventory: data.inventory || 0,
            tags: data.tags || []
        });
        ctx.emit('product.create.response', { product });
        ctx.broadcast('product.created', { product });
    });

    wsRouter.event('product.update', async (ctx) => {
        const data = await ctx.body();
        const product = db.updateProduct(data.productId, data.updates);
        ctx.emit('product.update.response', { product });
        ctx.broadcast('product.updated', { product });
    });

    wsRouter.event('product.delete', async (ctx) => {
        const data = await ctx.body();
        const deleted = db.deleteProduct(data.productId);
        ctx.emit('product.delete.response', { deleted });
        ctx.broadcast('product.deleted', { productId: data.productId });
    });

    // Order events (5)
    wsRouter.event('order.list', (ctx) => {
        ctx.emit('order.list.response', { orders: db.getOrders() });
    });

    wsRouter.event('order.get', async (ctx) => {
        const data = await ctx.body();
        const order = db.getOrder(data.orderId);
        ctx.emit('order.get.response', { order });
    });

    wsRouter.event('order.create', async (ctx) => {
        const data = await ctx.body();
        const order = db.createOrder({
            id: `order-${Date.now()}`,
            userId: data.userId,
            items: data.items,
            status: 'pending',
            total: data.total || 0,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        ctx.emit('order.create.response', { order });
        ctx.broadcast('order.created', { order });
    });

    wsRouter.event('order.updateStatus', async (ctx) => {
        const data = await ctx.body();
        const order = db.updateOrder(data.orderId, { status: data.status });
        ctx.emit('order.updateStatus.response', { order });
        ctx.broadcast('order.statusUpdated', { orderId: data.orderId, status: data.status });
    });

    wsRouter.event('order.cancel', async (ctx) => {
        const data = await ctx.body();
        const order = db.updateOrder(data.orderId, { status: 'cancelled' });
        ctx.emit('order.cancel.response', { order });
        ctx.broadcast('order.cancelled', { orderId: data.orderId });
    });

    // Notification events (4)
    wsRouter.event('notification.send', async (ctx) => {
        const data = await ctx.body();
        const notification = notifications.send({
            id: `notif-${Date.now()}`,
            userId: data.userId,
            type: data.type || 'in_app',
            title: data.title,
            body: data.body,
            read: false,
            createdAt: new Date()
        });
        ctx.emit('notification.send.response', { notification });
    });

    wsRouter.event('notification.list', async (ctx) => {
        const data = await ctx.body();
        const notifs = notifications.getForUser(data.userId);
        ctx.emit('notification.list.response', { notifications: notifs });
    });

    wsRouter.event('notification.markRead', async (ctx) => {
        const data = await ctx.body();
        const notification = notifications.markRead(data.notificationId);
        ctx.emit('notification.markRead.response', { notification });
    });

    wsRouter.event('notification.subscribe', async (ctx) => {
        const data = await ctx.body();
        notifications.subscribe(data.userId, (notif) => {
            ctx.emit('notification.new', { notification: notif });
        });
        ctx.emit('notification.subscribe.response', { subscribed: true });
    });

    // Analytics events (3)
    wsRouter.event('analytics.dashboard', (ctx) => {
        ctx.emit('analytics.dashboard.response', { metrics: db.getAnalytics() });
    });

    wsRouter.event('analytics.realtime', (ctx) => {
        ctx.emit('analytics.realtime.response', {
            timestamp: new Date().toISOString(),
            memory: process.memoryUsage(),
            uptime: process.uptime()
        });
    });

    wsRouter.event('analytics.track', async (ctx) => {
        const data = await ctx.body();
        db.trackEvent(data);
        ctx.emit('analytics.track.response', { tracked: true });
    });

    // Inventory events (3)
    wsRouter.event('inventory.get', async (ctx) => {
        const data = await ctx.body();
        const product = db.getProduct(data.productId);
        ctx.emit('inventory.get.response', {
            productId: data.productId,
            inventory: product?.inventory ?? 0
        });
    });

    wsRouter.event('inventory.adjust', async (ctx) => {
        const data = await ctx.body();
        const product = db.getProduct(data.productId);
        if (product) {
            const newInventory = Math.max(0, product.inventory + data.quantity);
            db.updateProduct(data.productId, { inventory: newInventory });
            ctx.emit('inventory.adjust.response', { productId: data.productId, newInventory });
            ctx.broadcast('inventory.updated', { productId: data.productId, newInventory });
        }
    });

    wsRouter.event('inventory.valuation', (ctx) => {
        const products = db.getProducts();
        const totalValue = products.reduce((sum, p) => sum + (p.inventory * p.price), 0);
        ctx.emit('inventory.valuation.response', { totalValue });
    });

    // Search events (2)
    wsRouter.event('search.users', async (ctx) => {
        const data = await ctx.body();
        const q = (data.query || '').toLowerCase();
        const users = db.getUsers().filter(u =>
            u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
        );
        ctx.emit('search.users.response', { users, query: q });
    });

    wsRouter.event('search.products', async (ctx) => {
        const data = await ctx.body();
        const q = (data.query || '').toLowerCase();
        const products = db.getProducts().filter(p =>
            p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
        );
        ctx.emit('search.products.response', { products, query: q });
    });

    // System events (2)
    wsRouter.event('system.health', (ctx) => {
        ctx.emit('system.health.response', {
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            version: process.version
        });
    });

    wsRouter.event('system.metrics', (ctx) => {
        ctx.emit('system.metrics.response', {
            cpuUsage: process.cpuUsage(),
            pid: process.pid
        });
    });

    // Chat/events (2)
    wsRouter.event('chat.message', async (ctx) => {
        const data = await ctx.body();
        ctx.broadcast('chat.broadcast', {
            message: data.message,
            sender: data.sender || 'anonymous',
            timestamp: Date.now()
        });
        ctx.emit('chat.message.ack', { received: true });
    });

    wsRouter.event('chat.typing', async (ctx) => {
        const data = await ctx.body();
        ctx.broadcast('chat.typing.broadcast', {
            sender: data.sender || 'anonymous',
            timestamp: Date.now()
        });
    });

    return wsRouter;
}
