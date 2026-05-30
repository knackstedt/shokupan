import { z } from 'zod';
import { validate } from '../../../src/plugins/middleware/validation';
import { ShokupanRouter } from '../../../src/router';
import { DatabaseService } from '../services/database';
import { Container } from '../../../src/decorators';

export class InventoryRouter extends ShokupanRouter {
    private db = Container.resolve(DatabaseService);

    constructor() {
        super({ name: 'Inventory API', group: 'inventory' });

        // GET /inventory
        this.get('/', {
            summary: 'Get all inventory',
            tags: ['Inventory']
        }, (ctx) => {
            const products = this.db.getProducts().map(p => ({
                productId: p.id,
                name: p.name,
                inventory: p.inventory,
                category: p.category
            }));
            return ctx.json({ inventory: products });
        });

        // GET /inventory/:id
        this.get('/:id', {
            summary: 'Get inventory for product',
            tags: ['Inventory']
        }, (ctx) => {
            const product = this.db.getProduct(ctx.params.id);
            if (!product) return ctx.json({ error: 'Product not found' }, 404);
            return ctx.json({
                productId: product.id,
                name: product.name,
                inventory: product.inventory,
                category: product.category
            });
        });

        // POST /inventory/:id/adjust
        this.post('/:id/adjust', {
            summary: 'Adjust inventory',
            tags: ['Inventory']
        }, validate({
            body: z.object({
                quantity: z.number().int(),
                reason: z.string().optional()
            })
        }), async (ctx) => {
            const body = await ctx.body();
            const product = this.db.getProduct(ctx.params.id);
            if (!product) return ctx.json({ error: 'Product not found' }, 404);
            const newInventory = Math.max(0, product.inventory + body.quantity);
            this.db.updateProduct(ctx.params.id, { inventory: newInventory });
            return ctx.json({
                productId: ctx.params.id,
                previousInventory: product.inventory,
                adjustment: body.quantity,
                newInventory,
                reason: body.reason
            });
        });

        // GET /inventory/valuation
        this.get('/valuation', {
            summary: 'Inventory valuation',
            tags: ['Inventory', 'Analytics']
        }, (ctx) => {
            const products = this.db.getProducts();
            const totalValue = products.reduce((sum, p) => sum + (p.inventory * p.price), 0);
            const categoryValues = products.reduce((acc, p) => {
                acc[p.category] = (acc[p.category] || 0) + (p.inventory * p.price);
                return acc;
            }, {} as Record<string, number>);
            return ctx.json({ totalValue, byCategory: categoryValues });
        });

        // GET /inventory/movements
        this.get('/movements', {
            summary: 'Inventory movements log',
            tags: ['Inventory']
        }, (ctx) => {
            return ctx.json({ movements: [] });
        });

        // POST /inventory/transfer
        this.post('/transfer', {
            summary: 'Transfer inventory',
            tags: ['Inventory']
        }, validate({
            body: z.object({
                fromProductId: z.string(),
                toProductId: z.string(),
                quantity: z.number().int().positive()
            })
        }), async (ctx) => {
            const body = await ctx.body();
            const fromProduct = this.db.getProduct(body.fromProductId);
            const toProduct = this.db.getProduct(body.toProductId);
            if (!fromProduct || !toProduct) {
                return ctx.json({ error: 'One or both products not found' }, 404);
            }
            if (fromProduct.inventory < body.quantity) {
                return ctx.json({ error: 'Insufficient inventory' }, 400);
            }
            this.db.updateProduct(body.fromProductId, { inventory: fromProduct.inventory - body.quantity });
            this.db.updateProduct(body.toProductId, { inventory: toProduct.inventory + body.quantity });
            return ctx.json({ transferred: true, quantity: body.quantity });
        });
    }
}
