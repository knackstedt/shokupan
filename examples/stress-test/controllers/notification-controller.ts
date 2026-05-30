import { ShokupanContext } from '../../../src/context';
import { Body, Ctx, Delete, Get, Param, Patch, Post, Query } from '../../../src/decorators';
import { NotificationService } from '../services/notification';
import { Container } from '../../../src/decorators';

export class NotificationController {
    private service = Container.resolve(NotificationService);

    @Get('/')
    getNotifications(@Query('userId') userId: string, @Query('unreadOnly') unreadOnly?: string) {
        let notifications = this.service.getForUser(userId);
        if (unreadOnly === 'true') {
            notifications = notifications.filter(n => !n.read);
        }
        return { notifications, count: notifications.length };
    }

    @Get('/:id')
    getNotification(@Param('id') id: string) {
        const notifications = Array.from((this.service as any).notifications?.values() || []);
        const notification = notifications.find((n: any) => n.id === id);
        if (!notification) return { error: 'Notification not found' };
        return { notification };
    }

    @Post('/')
    createNotification(@Body() body: any) {
        const notification = this.service.send({
            id: `notif-${Date.now()}`,
            userId: body.userId,
            type: body.type || 'in_app',
            title: body.title,
            body: body.body,
            read: false,
            createdAt: new Date()
        });
        return { notification };
    }

    @Patch('/:id/read')
    markRead(@Param('id') id: string) {
        const notification = this.service.markRead(id);
        return { notification };
    }

    @Delete('/:id')
    deleteNotification(@Param('id') id: string) {
        const deleted = this.service.deleteNotification(id);
        return { deleted };
    }

    @Get('/stats/:userId')
    getStats(@Param('userId') userId: string) {
        const notifications = this.service.getForUser(userId);
        const unread = notifications.filter(n => !n.read).length;
        const byType = notifications.reduce((acc: any, n: any) => {
            acc[n.type] = (acc[n.type] || 0) + 1;
            return acc;
        }, {});
        return { total: notifications.length, unread, byType };
    }
}
