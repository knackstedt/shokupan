import { z } from 'zod';
import { validate } from '../../../src/plugins/middleware/validation';
import { ShokupanRouter } from '../../../src/router';
import { DatabaseService } from '../services/database';
import { CacheService } from '../services/cache';
import { Container } from '../../../src/decorators';

export class UsersRouter extends ShokupanRouter {
    private db = Container.resolve(DatabaseService);
    private cache = Container.resolve(CacheService);

    constructor() {
        super({ name: 'Users API', group: 'users' });

        // GET /users - List all users
        this.get('/', {
            summary: 'List all users',
            description: 'Returns a paginated list of all registered users',
            tags: ['Users']
        }, (ctx) => {
            const page = parseInt(ctx.query.page || '1');
            const limit = Math.min(parseInt(ctx.query.limit || '20'), 100);
            const users = this.db.getUsers();
            const start = (page - 1) * limit;
            const paginated = users.slice(start, start + limit);
            return ctx.json({
                users: paginated,
                total: users.length,
                page,
                limit,
                pages: Math.ceil(users.length / limit)
            });
        });

        // GET /users/:id - Get user by ID
        this.get('/:id', {
            summary: 'Get user by ID',
            description: 'Returns a single user by their unique ID',
            tags: ['Users']
        }, (ctx) => {
            const cacheKey = `user:${ctx.params.id}`;
            const cached = this.cache.get(cacheKey);
            if (cached) return ctx.json({ cached: true, user: cached });

            const user = this.db.getUser(ctx.params.id);
            if (!user) return ctx.json({ error: 'User not found' }, 404);

            this.cache.set(cacheKey, user, 30000);
            return ctx.json({ user });
        });

        // GET /users/:id/orders - Get user orders
        this.get('/:id/orders', {
            summary: 'Get user orders',
            description: 'Returns all orders placed by a specific user',
            tags: ['Users', 'Orders']
        }, (ctx) => {
            const orders = this.db.getOrdersByUser(ctx.params.id);
            return ctx.json({ orders, count: orders.length });
        });

        // POST /users - Create user
        this.post('/', {
            summary: 'Create user',
            description: 'Create a new user account',
            tags: ['Users']
        }, validate({
            body: z.object({
                name: z.string().min(2).max(100),
                email: z.string().email(),
                role: z.enum(['admin', 'user', 'guest']).default('user')
            })
        }), async (ctx) => {
            const body = await ctx.body();
            const user = this.db.createUser({
                id: `user-${Date.now()}`,
                name: body.name,
                email: body.email,
                role: body.role,
                createdAt: new Date()
            });
            return ctx.json({ user }, 201);
        });

        // PUT /users/:id - Update user
        this.put('/:id', {
            summary: 'Update user',
            description: 'Update an existing user',
            tags: ['Users']
        }, validate({
            body: z.object({
                name: z.string().min(2).optional(),
                email: z.string().email().optional(),
                role: z.enum(['admin', 'user', 'guest']).optional()
            })
        }), async (ctx) => {
            const body = await ctx.body();
            const user = this.db.updateUser(ctx.params.id, body);
            if (!user) return ctx.json({ error: 'User not found' }, 404);
            this.cache.delete(`user:${ctx.params.id}`);
            return ctx.json({ user });
        });

        // PATCH /users/:id - Partial update
        this.patch('/:id', {
            summary: 'Partial update user',
            description: 'Partially update user fields',
            tags: ['Users']
        }, async (ctx) => {
            const body = await ctx.body();
            const user = this.db.updateUser(ctx.params.id, body);
            if (!user) return ctx.json({ error: 'User not found' }, 404);
            this.cache.delete(`user:${ctx.params.id}`);
            return ctx.json({ user });
        });

        // DELETE /users/:id - Delete user
        this.delete('/:id', {
            summary: 'Delete user',
            description: 'Delete a user by ID',
            tags: ['Users']
        }, (ctx) => {
            const deleted = this.db.deleteUser(ctx.params.id);
            if (!deleted) return ctx.json({ error: 'User not found' }, 404);
            this.cache.delete(`user:${ctx.params.id}`);
            return ctx.json({ deleted: true });
        });

        // GET /users/search - Search users
        this.get('/search', {
            summary: 'Search users',
            description: 'Search users by name or email',
            tags: ['Users']
        }, (ctx) => {
            const q = (ctx.query.q || '').toLowerCase();
            const users = this.db.getUsers().filter(u =>
                u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
            );
            return ctx.json({ users, query: q, count: users.length });
        });

        // GET /users/stats - User statistics
        this.get('/stats', {
            summary: 'User statistics',
            description: 'Aggregated user statistics',
            tags: ['Users', 'Analytics']
        }, (ctx) => {
            const users = this.db.getUsers();
            const roleCounts = users.reduce((acc, u) => {
                acc[u.role] = (acc[u.role] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            return ctx.json({
                total: users.length,
                roleDistribution: roleCounts,
                avgMetadata: users.reduce((sum, u) => sum + (u.metadata?.loginCount || 0), 0) / users.length
            });
        });

        // POST /users/:id/activate
        this.post('/:id/activate', {
            summary: 'Activate user',
            description: 'Activate a user account',
            tags: ['Users']
        }, (ctx) => {
            const user = this.db.getUser(ctx.params.id);
            if (!user) return ctx.json({ error: 'User not found' }, 404);
            return ctx.json({ activated: true, userId: ctx.params.id });
        });

        // POST /users/:id/deactivate
        this.post('/:id/deactivate', {
            summary: 'Deactivate user',
            description: 'Deactivate a user account',
            tags: ['Users']
        }, (ctx) => {
            const user = this.db.getUser(ctx.params.id);
            if (!user) return ctx.json({ error: 'User not found' }, 404);
            return ctx.json({ deactivated: true, userId: ctx.params.id });
        });
    }
}
