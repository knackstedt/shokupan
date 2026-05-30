import { z } from 'zod';
import { Container } from '../../../src/decorators';
import { validate } from '../../../src/plugins/middleware/validation';
import { ShokupanRouter } from '../../../src/router';
import { CacheService } from '../services/cache';
import { DatabaseService } from '../services/database';

export class ProductsRouter extends ShokupanRouter {
    private db = Container.resolve(DatabaseService);
    private cache = Container.resolve(CacheService);

    constructor() {
        super({ name: 'Products API', group: 'products' });

        // GET /products
        this.get('/', {
            summary: 'List products',
            description: 'Returns a paginated list of products with optional filtering',
            tags: ['Products']
        }, (ctx) => {
            const page = parseInt(ctx.query.page || '1');
            const limit = Math.min(parseInt(ctx.query.limit || '20'), 100);
            const category = ctx.query.category;
            const minPrice = ctx.query.minPrice ? parseFloat(ctx.query.minPrice) : undefined;
            const maxPrice = ctx.query.maxPrice ? parseFloat(ctx.query.maxPrice) : undefined;

            let products = this.db.getProducts();
            if (category) products = products.filter(p => p.category === category);
            if (minPrice !== undefined) products = products.filter(p => p.price >= minPrice);
            if (maxPrice !== undefined) products = products.filter(p => p.price <= maxPrice);

            const start = (page - 1) * limit;
            const paginated = products.slice(start, start + limit);
            return ctx.json({
                products: paginated,
                total: products.length,
                page,
                limit,
                filters: { category, minPrice, maxPrice }
            });
        });

        // GET /products/:id
        this.get('/:id', {
            summary: 'Get product by ID',
            description: 'Returns a single product',
            tags: ['Products']
        }, (ctx) => {
            const cacheKey = `product:${ctx.params.id}`;
            const cached = this.cache.get(cacheKey);
            if (cached) return ctx.json({ cached: true, product: cached });

            const product = this.db.getProduct(ctx.params.id);
            if (!product) return ctx.json({ error: 'Product not found' }, 404);
            this.cache.set(cacheKey, product, 30000);
            return ctx.json({ product });
        });

        // GET /products/:id/inventory
        this.get('/:id/inventory', {
            summary: 'Get product inventory',
            description: 'Returns current inventory for a product',
            tags: ['Products', 'Inventory']
        }, (ctx) => {
            const product = this.db.getProduct(ctx.params.id);
            if (!product) return ctx.json({ error: 'Product not found' }, 404);
            return ctx.json({ productId: ctx.params.id, inventory: product.inventory });
        });

        // POST /products
        this.post('/', {
            summary: 'Create product',
            description: 'Create a new product',
            tags: ['Products']
        }, validate({
            body: z.object({
                name: z.string().min(1).max(200),
                description: z.string().min(1),
                price: z.number().positive(),
                category: z.string(),
                inventory: z.number().int().min(0).default(0),
                tags: z.array(z.string()).default([])
            })
        }), async (ctx) => {
            const body = await ctx.body();
            const product = this.db.createProduct({
                id: `product-${Date.now()}`,
                ...body
            });
            return ctx.json({ product }, 201);
        });

        // PUT /products/:id
        this.put('/:id', {
            summary: 'Update product',
            description: 'Update an existing product',
            tags: ['Products']
        }, validate({
            body: z.object({
                name: z.string().min(1).optional(),
                description: z.string().optional(),
                price: z.number().positive().optional(),
                category: z.string().optional(),
                inventory: z.number().int().min(0).optional(),
                tags: z.array(z.string()).optional()
            })
        }), async (ctx) => {
            const body = await ctx.body();
            const product = this.db.updateProduct(ctx.params.id, body);
            if (!product) return ctx.json({ error: 'Product not found' }, 404);
            this.cache.delete(`product:${ctx.params.id}`);
            return ctx.json({ product });
        });

        // PATCH /products/:id
        this.patch('/:id', {
            summary: 'Partial update product',
            tags: ['Products']
        }, async (ctx) => {
            const body = await ctx.body();
            const product = this.db.updateProduct(ctx.params.id, body);
            if (!product) return ctx.json({ error: 'Product not found' }, 404);
            this.cache.delete(`product:${ctx.params.id}`);
            return ctx.json({ product });
        });

        // DELETE /products/:id
        this.delete('/:id', {
            summary: 'Delete product',
            tags: ['Products']
        }, (ctx) => {
            const deleted = this.db.deleteProduct(ctx.params.id);
            if (!deleted) return ctx.json({ error: 'Product not found' }, 404);
            this.cache.delete(`product:${ctx.params.id}`);
            return ctx.json({ deleted: true });
        });

        // GET /products/categories
        this.get('/categories', {
            summary: 'List categories',
            tags: ['Products']
        }, (ctx) => {
            const products = this.db.getProducts();
            const categories = Array.from(new Set(products.map(p => p.category)));
            return ctx.json({ categories });
        });

        // GET /products/:id/related
        this.get('/:id/related', {
            summary: 'Get related products',
            tags: ['Products']
        }, (ctx) => {
            const product = this.db.getProduct(ctx.params.id);
            if (!product) return ctx.json({ error: 'Product not found' }, 404);
            const related = this.db.getProducts()
                .filter(p => p.category === product.category && p.id !== product.id)
                .slice(0, 5);
            return ctx.json({ related });
        });

        // POST /products/:id/restock
        this.post('/:id/restock', {
            summary: 'Restock product',
            tags: ['Products', 'Inventory']
        }, validate({
            body: z.object({ quantity: z.number().int().positive() })
        }), async (ctx) => {
            const body = await ctx.body();
            const product = this.db.getProduct(ctx.params.id);
            if (!product) return ctx.json({ error: 'Product not found' }, 404);
            product.inventory += body.quantity;
            this.db.updateProduct(ctx.params.id, { inventory: product.inventory });
            return ctx.json({ productId: ctx.params.id, newInventory: product.inventory });
        });

        // GET /products/search
        this.get('/search', {
            summary: 'Search products',
            tags: ['Products']
        }, (ctx) => {
            const q = (ctx.query.q || '').toLowerCase();
            const products = this.db.getProducts().filter(p =>
                p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
            );
            return ctx.json({ products, query: q, count: products.length });
        });

        // GET /products/top-rated
        this.get('/top-rated', {
            summary: 'Top rated products',
            tags: ['Products']
        }, (ctx) => {
            const products = this.db.getProducts().sort((a, b) => b.price - a.price).slice(0, 10);
            return ctx.json({ products });
        });

        // POST /products/bulk-update
        this.post('/bulk-update', {
            summary: 'Bulk update products',
            tags: ['Products']
        }, async (ctx) => {
            const body = await ctx.body();
            const { ids, updates } = body;
            const results = [];
            for (const id of ids || []) {
                const product = this.db.updateProduct(id, updates);
                if (product) {
                    this.cache.delete(`product:${id}`);
                    results.push(product);
                }
            }
            return ctx.json({ updated: results.length, products: results });
        });

        // GET /products/out-of-stock
        this.get('/out-of-stock', {
            summary: 'Out of stock products',
            tags: ['Products', 'Inventory']
        }, (ctx) => {
            const products = this.db.getProducts().filter(p => p.inventory === 0);
            return ctx.json({ products, count: products.length });
        });

        // GET /products/low-stock
        this.get('/low-stock', {
            summary: 'Low stock products',
            tags: ['Products', 'Inventory']
        }, (ctx) => {
            const threshold = parseInt(ctx.query.threshold || '10');
            const products = this.db.getProducts().filter(p => p.inventory > 0 && p.inventory <= threshold);
            return ctx.json({ products, count: products.length, threshold });
        });
    }
}
