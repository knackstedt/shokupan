import { z } from 'zod';
import { validate } from '../../../../src/plugins/middleware/validation';
import { ShokupanRouter } from '../../../../src/router';

/**
 * Zod Validation Examples
 * 
 * This router demonstrates schema validation using Zod.
 * Zod is a TypeScript-first schema validation library.
 */
export class ZodValidationRouter extends ShokupanRouter {
    constructor() {
        super({
            name: 'Zod Validation Examples',
            group: 'validation'
        });

        // Example 1: Body Validation
        this.post('/create-user',
            {
                summary: 'Create User (Zod)',
                description: 'Create a user with Zod body validation',
                tags: ['Validation', 'Zod']
            },
            validate({
                body: z.object({
                    name: z.string().min(3).max(50),
                    email: z.string().email(),
                    age: z.number().int().min(18).max(120),
                    role: z.enum(['user', 'admin', 'moderator']).optional()
                })
            }),
            async (ctx) => {
                const userData = await ctx.body();
                return ctx.json({
                    message: 'User created successfully!',
                    data: userData,
                    validator: 'Zod'
                }, 201);
            }
        );

        // Example 2: Query Parameter Validation
        this.get('/search',
            {
                summary: 'Search Users (Zod)',
                description: 'Search users with Zod query parameter validation',
                tags: ['Validation', 'Zod']
            },
            validate({
                query: z.object({
                    q: z.string().min(1),
                    page: z.string().regex(/^\d+$/).transform(Number).optional(),
                    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().min(1).max(100)).optional(),
                    verified: z.enum(['true', 'false']).transform(v => v === 'true').optional()
                })
            }),
            (ctx) => {
                const query = ctx.query;
                return ctx.json({
                    message: 'Search results',
                    query,
                    validator: 'Zod',
                    results: []
                });
            }
        );

        // Example 3: Path Parameter Validation
        this.get('/user/:id',
            {
                summary: 'Get User by ID (Zod)',
                description: 'Fetch user with Zod path parameter validation',
                tags: ['Validation', 'Zod']
            },
            validate({
                params: z.object({
                    id: z.string().uuid()
                })
            }),
            (ctx) => {
                const { id } = ctx.params;
                return ctx.json({
                    message: 'User found',
                    userId: id,
                    validator: 'Zod',
                    user: {
                        id,
                        name: 'John Doe',
                        email: 'john@example.com'
                    }
                });
            }
        );

        // Example 4: Combined Validation (Body + Query)
        this.post('/update/:id',
            {
                summary: 'Update User (Zod)',
                description: 'Update user with combined body, params, and query validation',
                tags: ['Validation', 'Zod']
            },
            validate({
                params: z.object({
                    id: z.string().regex(/^\d+$/)
                }),
                query: z.object({
                    notify: z.enum(['true', 'false']).transform(v => v === 'true').optional()
                }),
                body: z.object({
                    name: z.string().min(3).optional(),
                    email: z.string().email().optional(),
                    age: z.number().int().min(18).optional()
                }).refine(data => Object.keys(data).length > 0, {
                    message: 'At least one field must be provided'
                })
            }),
            async (ctx) => {
                const { id } = ctx.params;
                const { notify } = ctx.query;
                const updates = await ctx.body();

                return ctx.json({
                    message: 'User updated successfully',
                    userId: id,
                    updates,
                    notificationSent: notify === 'true',
                    validator: 'Zod'
                });
            }
        );

        // Example 5: Complex Nested Objects
        this.post('/create-order',
            {
                summary: 'Create Order (Zod)',
                description: 'Create an order with nested object validation',
                tags: ['Validation', 'Zod']
            },
            validate({
                body: z.object({
                    customerId: z.string().uuid(),
                    items: z.array(z.object({
                        productId: z.string(),
                        quantity: z.number().int().min(1),
                        price: z.number().positive()
                    })).min(1),
                    shipping: z.object({
                        address: z.string().min(5),
                        city: z.string(),
                        zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
                        country: z.string().length(2)
                    }),
                    paymentMethod: z.enum(['credit_card', 'paypal', 'bank_transfer'])
                })
            }),
            async (ctx) => {
                const order = await ctx.body();
                const total = order.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

                return ctx.json({
                    message: 'Order created successfully',
                    orderId: crypto.randomUUID(),
                    total,
                    validator: 'Zod'
                }, 201);
            }
        );

        // Example 6: Custom Error Handler
        this.post('/register',
            {
                summary: 'Register User (Zod with Custom Errors)',
                description: 'User registration with detailed Zod validation errors',
                tags: ['Validation', 'Zod']
            },
            validate({
                body: z.object({
                    username: z.string()
                        .min(3, 'Username must be at least 3 characters')
                        .max(20, 'Username must not exceed 20 characters')
                        .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
                    password: z.string()
                        .min(8, 'Password must be at least 8 characters')
                        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
                        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
                        .regex(/[0-9]/, 'Password must contain at least one number'),
                    confirmPassword: z.string()
                }).refine(data => data.password === data.confirmPassword, {
                    message: 'Passwords do not match',
                    path: ['confirmPassword']
                })
            }),
            async (ctx) => {
                const { username, password } = await ctx.body();
                return ctx.json({
                    message: 'User registered successfully',
                    username,
                    validator: 'Zod'
                }, 201);
            }
        );
    }
}
