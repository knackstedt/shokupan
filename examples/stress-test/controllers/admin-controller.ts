import { ShokupanContext } from '../../../src/context';
import { Body, Controller, Ctx, Delete, Get, Param, Patch, Post, Put, Query } from '../../../src/decorators';
import { DatabaseService } from '../services/database';
import { CacheService } from '../services/cache';
import { Container } from '../../../src/decorators';

@Controller('/admin')
export class AdminController {
    private db = Container.resolve(DatabaseService);
    private cache = Container.resolve(CacheService);

    @Get('/dashboard')
    dashboard() {
        return {
            users: this.db.getUsers().length,
            products: this.db.getProducts().length,
            orders: this.db.getOrders().length,
            revenue: this.db.getAnalytics().totalRevenue
        };
    }

    @Get('/users')
    listUsers(@Query('page') page: string = '1', @Query('limit') limit: string = '50') {
        const users = this.db.getUsers();
        const p = parseInt(page);
        const l = Math.min(parseInt(limit), 100);
        const start = (p - 1) * l;
        return { users: users.slice(start, start + l), total: users.length };
    }

    @Get('/users/:id')
    getUser(@Param('id') id: string) {
        const user = this.db.getUser(id);
        if (!user) return { error: 'User not found' };
        return { user };
    }

    @Put('/users/:id/role')
    updateUserRole(@Param('id') id: string, @Body() body: any) {
        const user = this.db.updateUser(id, { role: body.role });
        if (!user) return { error: 'User not found' };
        return { user };
    }

    @Delete('/users/:id')
    deleteUser(@Param('id') id: string) {
        const deleted = this.db.deleteUser(id);
        return { deleted };
    }

    @Get('/cache/stats')
    cacheStats() {
        return { keys: this.cache.keys(), size: this.cache.size() };
    }

    @Post('/cache/clear')
    clearCache() {
        this.cache.clear();
        return { cleared: true };
    }

    @Delete('/cache/:key')
    deleteCacheKey(@Param('key') key: string) {
        const deleted = this.cache.delete(key);
        return { deleted };
    }

    @Get('/system/health')
    systemHealth() {
        return {
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            version: process.version,
            platform: process.platform
        };
    }

    @Get('/system/metrics')
    systemMetrics() {
        return {
            cpuUsage: process.cpuUsage(),
            resourceUsage: process.resourceUsage?.(),
            pid: process.pid
        };
    }

    @Post('/bulk/delete-users')
    bulkDeleteUsers(@Body() body: any) {
        const { ids } = body;
        let deleted = 0;
        for (const id of ids || []) {
            if (this.db.deleteUser(id)) deleted++;
        }
        return { deleted };
    }

    @Post('/bulk/update-products')
    bulkUpdateProducts(@Body() body: any) {
        const { ids, updates } = body;
        let updated = 0;
        for (const id of ids || []) {
            if (this.db.updateProduct(id, updates)) updated++;
        }
        return { updated };
    }
}
