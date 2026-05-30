import { Injectable } from '../../../src/decorators';

export interface Notification {
    id: string;
    userId: string;
    type: 'email' | 'sms' | 'push' | 'in_app';
    title: string;
    body: string;
    read: boolean;
    createdAt: Date;
}

@Injectable('singleton')
export class NotificationService {
    private notifications: Map<string, Notification> = new Map();
    private listeners: Map<string, ((notification: Notification) => void)[]> = new Map();

    send(notification: Notification) {
        this.notifications.set(notification.id, notification);
        const listeners = this.listeners.get(notification.userId) || [];
        listeners.forEach(fn => {
            try { fn(notification); } catch { /* ignore */ }
        });
        return notification;
    }

    getForUser(userId: string) {
        return Array.from(this.notifications.values()).filter(n => n.userId === userId);
    }

    markRead(id: string) {
        const n = this.notifications.get(id);
        if (n) {
            n.read = true;
            this.notifications.set(id, n);
        }
        return n;
    }

    deleteNotification(id: string) {
        return this.notifications.delete(id);
    }

    subscribe(userId: string, callback: (notification: Notification) => void) {
        if (!this.listeners.has(userId)) {
            this.listeners.set(userId, []);
        }
        this.listeners.get(userId)!.push(callback);
        return () => {
            const arr = this.listeners.get(userId) || [];
            const idx = arr.indexOf(callback);
            if (idx >= 0) arr.splice(idx, 1);
        };
    }
}
