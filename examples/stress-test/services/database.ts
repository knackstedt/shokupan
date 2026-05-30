import { Injectable } from '../../../src/decorators';

export interface User {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'user' | 'guest';
    createdAt: Date;
    metadata?: Record<string, any>;
}

export interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    inventory: number;
    tags: string[];
    metadata?: Record<string, any>;
}

export interface Order {
    id: string;
    userId: string;
    items: OrderItem[];
    status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
    total: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface OrderItem {
    productId: string;
    quantity: number;
    price: number;
}

@Injectable('singleton')
export class DatabaseService {
    private users: Map<string, User> = new Map();
    private products: Map<string, Product> = new Map();
    private orders: Map<string, Order> = new Map();
    private analyticsEvents: any[] = [];

    constructor() {
        this.seedData();
    }

    private seedData() {
        // Seed users
        for (let i = 1; i <= 20; i++) {
            const user: User = {
                id: `user-${i}`,
                name: `User ${i}`,
                email: `user${i}@example.com`,
                role: i === 1 ? 'admin' : (i % 3 === 0 ? 'guest' : 'user'),
                createdAt: new Date(Date.now() - i * 86400000),
                metadata: { loginCount: i * 5 }
            };
            this.users.set(user.id, user);
        }

        // Seed products
        const categories = ['electronics', 'clothing', 'food', 'books', 'home'];
        for (let i = 1; i <= 50; i++) {
            const product: Product = {
                id: `product-${i}`,
                name: `Product ${i}`,
                description: `Description for product ${i}`,
                price: Math.round((Math.random() * 1000 + 10) * 100) / 100,
                category: categories[i % categories.length],
                inventory: Math.floor(Math.random() * 1000),
                tags: [`tag-${i % 5}`, `category-${categories[i % categories.length]}`],
                metadata: { sku: `SKU-${i}` }
            };
            this.products.set(product.id, product);
        }

        // Seed orders
        for (let i = 1; i <= 30; i++) {
            const order: Order = {
                id: `order-${i}`,
                userId: `user-${(i % 20) + 1}`,
                items: [
                    { productId: `product-${i}`, quantity: Math.floor(Math.random() * 5) + 1, price: 0 },
                    { productId: `product-${(i + 1) % 50 + 1}`, quantity: Math.floor(Math.random() * 3) + 1, price: 0 }
                ],
                status: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'][i % 5] as any,
                total: Math.round(Math.random() * 5000 * 100) / 100,
                createdAt: new Date(Date.now() - i * 3600000),
                updatedAt: new Date(Date.now() - i * 1800000)
            };
            this.orders.set(order.id, order);
        }
    }

    getUsers() { return Array.from(this.users.values()); }
    getUser(id: string) { return this.users.get(id); }
    createUser(user: User) { this.users.set(user.id, user); return user; }
    updateUser(id: string, updates: Partial<User>) {
        const user = this.users.get(id);
        if (!user) return null;
        const updated = { ...user, ...updates };
        this.users.set(id, updated);
        return updated;
    }
    deleteUser(id: string) { return this.users.delete(id); }

    getProducts() { return Array.from(this.products.values()); }
    getProduct(id: string) { return this.products.get(id); }
    getProductsByCategory(category: string) {
        return this.getProducts().filter(p => p.category === category);
    }
    createProduct(product: Product) { this.products.set(product.id, product); return product; }
    updateProduct(id: string, updates: Partial<Product>) {
        const product = this.products.get(id);
        if (!product) return null;
        const updated = { ...product, ...updates };
        this.products.set(id, updated);
        return updated;
    }
    deleteProduct(id: string) { return this.products.delete(id); }

    getOrders() { return Array.from(this.orders.values()); }
    getOrder(id: string) { return this.orders.get(id); }
    getOrdersByUser(userId: string) {
        return this.getOrders().filter(o => o.userId === userId);
    }
    createOrder(order: Order) { this.orders.set(order.id, order); return order; }
    updateOrder(id: string, updates: Partial<Order>) {
        const order = this.orders.get(id);
        if (!order) return null;
        const updated = { ...order, ...updates, updatedAt: new Date() };
        this.orders.set(id, updated);
        return updated;
    }
    deleteOrder(id: string) { return this.orders.delete(id); }

    trackEvent(event: any) {
        this.analyticsEvents.push({ ...event, timestamp: new Date() });
    }
    getAnalytics() {
        return {
            totalUsers: this.users.size,
            totalProducts: this.products.size,
            totalOrders: this.orders.size,
            totalRevenue: this.getOrders().reduce((sum, o) => sum + o.total, 0),
            eventCount: this.analyticsEvents.length
        };
    }
}
