import { Type } from '@sinclair/typebox';
import 'reflect-metadata';
import {
    Body,
    Compression,
    Controller,
    Cors,
    Delete,
    Get,
    Injectable,
    Param,
    Post,
    Put,
    Query,
    RateLimitMiddleware,
    SecurityHeaders,
    Shokupan,
    validate,
} from '../src/index';

/**
 * Sample 1: E-commerce API
 *
 * Tests: CORS, Compression, Rate Limiting, Security Headers, TypeBox Validation, Decorators
 */

const ProductSchema = Type.Object({
    name: Type.String({ minLength: 1, maxLength: 200 }),
    price: Type.Number({ minimum: 0 }),
    stock: Type.Integer({ minimum: 0 }),
    category: Type.String()
});

const OrderSchema = Type.Object({
    items: Type.Array(Type.Object({
        productId: Type.String(),
        quantity: Type.Integer({ minimum: 1 })
    })),
    shippingAddress: Type.String({ minLength: 5 })
});

interface Product {
    id: string;
    name: string;
    price: number;
    stock: number;
    category: string;
}

interface Order {
    id: string;
    items: Array<{ productId: string; quantity: number }>;
    shippingAddress: string;
    status: 'pending' | 'shipped' | 'delivered';
    total: number;
}

@Injectable()
class ProductService {
    private products: Product[] = [
        { id: '1', name: 'Laptop', price: 999.99, stock: 10, category: 'electronics' },
        { id: '2', name: 'Headphones', price: 149.99, stock: 50, category: 'electronics' },
        { id: '3', name: 'Coffee Mug', price: 12.99, stock: 100, category: 'home' }
    ];
    private nextId = 4;

    findAll(category?: string): Product[] {
        if (category) {
            return this.products.filter(p => p.category === category);
        }
        return this.products;
    }

    findById(id: string): Product | undefined {
        return this.products.find(p => p.id === id);
    }

    create(data: Omit<Product, 'id'>): Product {
        const product: Product = { id: String(this.nextId++), ...data };
        this.products.push(product);
        return product;
    }

    update(id: string, data: Partial<Product>): Product | undefined {
        const product = this.products.find(p => p.id === id);
        if (!product) return undefined;
        Object.assign(product, data);
        return product;
    }

    delete(id: string): boolean {
        const index = this.products.findIndex(p => p.id === id);
        if (index === -1) return false;
        this.products.splice(index, 1);
        return true;
    }
}

@Injectable()
class OrderService {
    private orders: Order[] = [];
    private nextId = 1;

    constructor(private productService: ProductService) {}

    create(data: Omit<Order, 'id' | 'status' | 'total'>): Order | { error: string } {
        let total = 0;
        for (const item of data.items) {
            const product = this.productService.findById(item.productId);
            if (!product) return { error: `Product ${item.productId} not found` };
            if (product.stock < item.quantity) return { error: `Insufficient stock for ${product.name}` };
            total += product.price * item.quantity;
            product.stock -= item.quantity;
        }

        const order: Order = {
            id: String(this.nextId++),
            ...data,
            status: 'pending',
            total: Math.round(total * 100) / 100
        };
        this.orders.push(order);
        return order;
    }

    findAll(): Order[] {
        return this.orders;
    }

    findById(id: string): Order | undefined {
        return this.orders.find(o => o.id === id);
    }

    updateStatus(id: string, status: Order['status']): Order | undefined {
        const order = this.orders.find(o => o.id === id);
        if (!order) return undefined;
        order.status = status;
        return order;
    }
}

@Controller('/api/products')
class ProductController {
    constructor(private productService: ProductService) {}

    @Get('/')
    list(@Query('category') category?: string) {
        return { data: this.productService.findAll(category) };
    }

    @Get('/:id')
    getById(@Param('id') id: string) {
        const product = this.productService.findById(id);
        if (!product) return { error: 'Product not found' };
        return { data: product };
    }

    @Post('/')
    create(@Body() body: { name: string; price: number; stock: number; category: string }) {
        const product = this.productService.create(body);
        return { data: product, message: 'Product created' };
    }

    @Put('/:id')
    update(@Param('id') id: string, @Body() body: Partial<Product>) {
        const product = this.productService.update(id, body);
        if (!product) return { error: 'Product not found' };
        return { data: product };
    }

    @Delete('/:id')
    remove(@Param('id') id: string) {
        const deleted = this.productService.delete(id);
        if (!deleted) return { error: 'Product not found' };
        return { message: 'Product deleted' };
    }
}

@Controller('/api/orders')
class OrderController {
    constructor(private orderService: OrderService) {}

    @Get('/')
    list() {
        return { data: this.orderService.findAll() };
    }

    @Get('/:id')
    getById(@Param('id') id: string) {
        const order = this.orderService.findById(id);
        if (!order) return { error: 'Order not found' };
        return { data: order };
    }

    @Post('/')
    create(@Body() body: { items: Array<{ productId: string; quantity: number }>; shippingAddress: string }) {
        const order = this.orderService.create(body);
        if ('error' in order) return { error: order.error };
        return { data: order, message: 'Order created' };
    }
}

const app = new Shokupan({
    port: 3101,
    development: true,
    enableOpenApiGen: true
});

// Middleware stack
app.use(Cors({
    origin: ['http://localhost:3000', 'https://example.com'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(Compression({ threshold: 128 }));

app.use(RateLimitMiddleware({
    windowMs: 60 * 1000,
    max: 100,
    headers: true
}));

app.use(SecurityHeaders({
    contentSecurityPolicy: true,
    hsts: true
}));

// Request logging
app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    console.log(`${ctx.request.method} ${ctx.request.url} - ${ctx.response.status} (${Date.now() - start}ms)`);
});

// Health check
app.get('/health', (ctx) => {
    return ctx.json({ status: 'ok', service: 'ecommerce-api', timestamp: new Date().toISOString() });
});

// Validation routes
app.post('/api/validate-product', validate({ body: ProductSchema }), async (ctx) => {
    const body = await ctx.body();
    return ctx.json({ valid: true, data: body });
});

app.post('/api/validate-order', validate({ body: OrderSchema }), async (ctx) => {
    const body = await ctx.body();
    return ctx.json({ valid: true, data: body });
});

// Mount controllers
app.mount('/', ProductController);
app.mount('/', OrderController);

// 404
app.get('/*', (ctx) => ctx.json({ error: 'Not found' }, 404));

await app.listen();
console.log('E-commerce API running on http://localhost:3101');
console.log('Endpoints:');
console.log('  GET    /api/products');
console.log('  GET    /api/products/:id');
console.log('  POST   /api/products');
console.log('  PUT    /api/products/:id');
console.log('  DELETE /api/products/:id');
console.log('  GET    /api/orders');
console.log('  GET    /api/orders/:id');
console.log('  POST   /api/orders');
