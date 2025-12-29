import { ShokupanRouter } from '../../router';

/**
 * Dependency Injection Examples
 * 
 * This demonstrates Shokupan's built-in dependency injection system.
 * Services can be injected into controllers via constructor injection.
 */

// Example Service 1: Database Service
class DatabaseService {
    private data = new Map<string, any>();

    get(key: string) {
        return this.data.get(key);
    }

    set(key: string, value: any) {
        this.data.set(key, value);
        return value;
    }

    delete(key: string) {
        return this.data.delete(key);
    }

    all() {
        return Array.from(this.data.entries());
    }
}

// Example Service 2: Logger Service
class LoggerService {
    private logs: string[] = [];

    log(message: string) {
        const logEntry = `[${new Date().toISOString()}] ${message}`;
        this.logs.push(logEntry);
        console.log(logEntry);
    }

    getLogs() {
        return this.logs;
    }

    clear() {
        this.logs = [];
    }
}

// Example Service 3: User Service (depends on other services)
class UserService {
    constructor(
        private db: DatabaseService,
        private logger: LoggerService
    ) { }

    createUser(userData: any) {
        const id = crypto.randomUUID();
        const user = { id, ...userData, createdAt: new Date().toISOString() };
        this.db.set(`user:${id}`, user);
        this.logger.log(`User created: ${id}`);
        return user;
    }

    getUser(id: string) {
        const user = this.db.get(`user:${id}`);
        if (user) {
            this.logger.log(`User retrieved: ${id}`);
        }
        return user;
    }

    updateUser(id: string, updates: any) {
        const user = this.db.get(`user:${id}`);
        if (!user) return null;

        const updated = { ...user, ...updates, updatedAt: new Date().toISOString() };
        this.db.set(`user:${id}`, updated);
        this.logger.log(`User updated: ${id}`);
        return updated;
    }

    deleteUser(id: string) {
        const deleted = this.db.delete(`user:${id}`);
        if (deleted) {
            this.logger.log(`User deleted: ${id}`);
        }
        return deleted;
    }

    listUsers() {
        const users = this.db.all()
            .filter(([key]) => key.startsWith('user:'))
            .map(([, value]) => value);
        this.logger.log(`Listed ${users.length} users`);
        return users;
    }
}

// Controller using dependency injection
export class DIExampleController {
    constructor(
        private userService: UserService,
        private logger: LoggerService,
        private db: DatabaseService
    ) {
        this.logger.log('DIExampleController initialized');
    }

    // Example 1: Create user using injected service
    async postCreate(ctx: any) {
        const userData = await ctx.body();
        const user = this.userService.createUser(userData);

        return ctx.json({
            message: 'User created via DI service',
            user,
            di: 'UserService injected via constructor'
        }, 201);
    }

    // Example 2: Get user
    async getUsers(ctx: any) {
        const { id } = ctx.params;

        if (id) {
            const user = this.userService.getUser(id);
            if (!user) {
                return ctx.json({ error: 'User not found' }, 404);
            }
            return ctx.json({ user, di: 'UserService' });
        }

        const users = this.userService.listUsers();
        return ctx.json({
            users,
            count: users.length,
            di: 'UserService'
        });
    }

    // Example 3: Update user
    async putUpdate(ctx: any) {
        const { id } = ctx.params;
        const updates = await ctx.body();

        const user = this.userService.updateUser(id, updates);
        if (!user) {
            return ctx.json({ error: 'User not found' }, 404);
        }

        return ctx.json({
            message: 'User updated',
            user,
            di: 'UserService'
        });
    }

    // Example 4: Delete user
    async deleteUsers(ctx: any) {
        const { id } = ctx.params;
        const deleted = this.userService.deleteUser(id);

        if (!deleted) {
            return ctx.json({ error: 'User not found' }, 404);
        }

        return ctx.json({
            message: 'User deleted',
            di: 'UserService'
        });
    }

    // Example 5: Get logs
    async getAdminLogs(ctx: any) {
        const logs = this.logger.getLogs();
        return ctx.json({
            logs,
            count: logs.length,
            di: 'LoggerService'
        });
    }

    // Example 6: Direct database access
    async getDatabaseRaw(ctx: any) {
        const all = this.db.all();
        return ctx.json({
            message: 'Direct database access',
            entries: all,
            count: all.length,
            di: 'DatabaseService'
        });
    }

    // Example 7: Complex operation using multiple services
    async postBatch(ctx: any) {
        const { users } = await ctx.body();

        if (!Array.isArray(users)) {
            return ctx.json({ error: 'users must be an array' }, 400);
        }

        const created = users.map(userData => this.userService.createUser(userData));
        const logs = this.logger.getLogs().slice(-users.length);

        return ctx.json({
            message: 'Batch operation completed',
            created,
            count: created.length,
            recentLogs: logs,
            di: 'Multiple services (UserService, LoggerService)'
        }, 201);
    }
}

// Simple router to demonstrate DI across routers
export class DIStatsRouter extends ShokupanRouter {
    constructor(
        private logger: LoggerService,
        private db: DatabaseService
    ) {
        super({
            name: 'DI Stats Router',
            group: 'dependency-injection'
        });

        this.get('/stats', (ctx) => {
            const dbEntries = this.db.all();
            const logCount = this.logger.getLogs().length;

            return ctx.json({
                message: 'System stats via DI',
                stats: {
                    databaseEntries: dbEntries.length,
                    logEntries: logCount
                },
                di: 'Injected into router constructor'
            });
        });

        this.delete('/clear-logs', (ctx) => {
            const count = this.logger.getLogs().length;
            this.logger.clear();

            return ctx.json({
                message: 'Logs cleared',
                clearedCount: count,
                di: 'LoggerService'
            });
        });
    }
}
