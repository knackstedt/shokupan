import { ShokupanRouter } from '../../../src/router';
import { DatabaseService } from '../services/database';
import { Container } from '../../../src/decorators';

export class AnalyticsRouter extends ShokupanRouter {
    private db = Container.resolve(DatabaseService);

    constructor() {
        super({ name: 'Analytics API', group: 'analytics' });

        // GET /analytics/dashboard
        this.get('/dashboard', {
            summary: 'Dashboard metrics',
            tags: ['Analytics']
        }, (ctx) => {
            const analytics = this.db.getAnalytics();
            return ctx.json({ metrics: analytics });
        });

        // GET /analytics/users
        this.get('/users', {
            summary: 'User analytics',
            tags: ['Analytics']
        }, (ctx) => {
            const users = this.db.getUsers();
            const byRole = users.reduce((acc, u) => {
                acc[u.role] = (acc[u.role] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            const byMonth = users.reduce((acc, u) => {
                const month = u.createdAt.toISOString().slice(0, 7);
                acc[month] = (acc[month] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            return ctx.json({ total: users.length, byRole, byMonth });
        });

        // GET /analytics/products
        this.get('/products', {
            summary: 'Product analytics',
            tags: ['Analytics']
        }, (ctx) => {
            const products = this.db.getProducts();
            const byCategory = products.reduce((acc, p) => {
                acc[p.category] = (acc[p.category] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            const avgPrice = products.reduce((sum, p) => sum + p.price, 0) / products.length;
            const totalInventory = products.reduce((sum, p) => sum + p.inventory, 0);
            return ctx.json({ total: products.length, byCategory, avgPrice, totalInventory });
        });

        // GET /analytics/sales
        this.get('/sales', {
            summary: 'Sales analytics',
            tags: ['Analytics']
        }, (ctx) => {
            const orders = this.db.getOrders();
            const byStatus = orders.reduce((acc, o) => {
                acc[o.status] = (acc[o.status] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            const revenueByDay = orders.reduce((acc, o) => {
                const day = o.createdAt.toISOString().slice(0, 10);
                acc[day] = (acc[day] || 0) + o.total;
                return acc;
            }, {} as Record<string, number>);
            return ctx.json({ totalOrders: orders.length, byStatus, revenueByDay });
        });

        // GET /analytics/realtime
        this.get('/realtime', {
            summary: 'Real-time metrics',
            tags: ['Analytics']
        }, (ctx) => {
            return ctx.json({
                timestamp: new Date().toISOString(),
                memory: process.memoryUsage(),
                uptime: process.uptime(),
                cpuUsage: process.cpuUsage()
            });
        });
    }
}
