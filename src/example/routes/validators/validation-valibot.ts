import * as v from 'valibot';
import { valibot, validate } from '../../../plugins/validation';
import { ShokupanRouter } from '../../../router';

/**
 * Valibot Validation Examples
 * 
 * This router demonstrates schema validation using Valibot.
 * Valibot is a modular and type-safe schema validation library.
 */
export class ValibotValidationRouter extends ShokupanRouter {
    constructor() {
        super({
            name: 'Valibot Validation Examples',
            group: 'validation'
        });

        // Example 1: Body Validation
        this.post('/create-user',
            {
                summary: 'Create User (Valibot)',
                description: 'Create a user with Valibot body validation',
                tags: ['Validation', 'Valibot']
            },
            validate({
                body: valibot(
                    v.object({
                        name: v.pipe(v.string(), v.minLength(3), v.maxLength(50)),
                        email: v.pipe(v.string(), v.email()),
                        age: v.pipe(v.number(), v.integer(), v.minValue(18), v.maxValue(120)),
                        role: v.optional(v.picklist(['user', 'admin', 'moderator']))
                    }),
                    v.parse
                )
            }),
            async (ctx) => {
                const userData = await ctx.body();
                return ctx.json({
                    message: 'User created successfully!',
                    data: userData,
                    validator: 'Valibot'
                }, 201);
            }
        );

        // Example 2: Query Parameter Validation
        this.get('/search',
            {
                summary: 'Search Users (Valibot)',
                description: 'Search users with Valibot query parameter validation',
                tags: ['Validation', 'Valibot']
            },
            validate({
                query: valibot(
                    v.object({
                        q: v.pipe(v.string(), v.minLength(1)),
                        page: v.optional(v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number))),
                        limit: v.optional(v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number))),
                        verified: v.optional(v.pipe(
                            v.picklist(['true', 'false']),
                            v.transform(val => val === 'true')
                        ))
                    }),
                    v.parse
                )
            }),
            (ctx) => {
                const query = ctx.query;
                return ctx.json({
                    message: 'Search results',
                    query,
                    validator: 'Valibot',
                    results: []
                });
            }
        );

        // Example 3: Path Parameter Validation
        this.get('/user/:id',
            {
                summary: 'Get User by ID (Valibot)',
                description: 'Fetch user with Valibot path parameter validation',
                tags: ['Validation', 'Valibot']
            },
            validate({
                params: valibot(
                    v.object({
                        id: v.pipe(v.string(), v.uuid())
                    }),
                    v.parse
                )
            }),
            (ctx) => {
                const { id } = ctx.params;
                return ctx.json({
                    message: 'User found',
                    userId: id,
                    validator: 'Valibot',
                    user: {
                        id,
                        name: 'Bob Wilson',
                        email: 'bob@example.com'
                    }
                });
            }
        );

        // Example 4: Complex Nested Objects
        this.post('/create-order',
            {
                summary: 'Create Order (Valibot)',
                description: 'Create an order with nested object validation',
                tags: ['Validation', 'Valibot']
            },
            validate({
                body: valibot(
                    v.object({
                        customerId: v.pipe(v.string(), v.uuid()),
                        items: v.pipe(
                            v.array(
                                v.object({
                                    productId: v.string(),
                                    quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
                                    price: v.pipe(v.number(), v.minValue(0, { exclusive: true }))
                                })
                            ),
                            v.minLength(1)
                        ),
                        shipping: v.object({
                            address: v.pipe(v.string(), v.minLength(5)),
                            city: v.string(),
                            zipCode: v.pipe(v.string(), v.regex(/^\d{5}(-\d{4})?$/)),
                            country: v.pipe(v.string(), v.length(2))
                        }),
                        paymentMethod: v.picklist(['credit_card', 'paypal', 'bank_transfer'])
                    }),
                    v.parse
                )
            }),
            async (ctx) => {
                const order = await ctx.body();
                const total = order.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

                return ctx.json({
                    message: 'Order created successfully',
                    orderId: crypto.randomUUID(),
                    total,
                    validator: 'Valibot'
                }, 201);
            }
        );

        // Example 5: Custom Validation Rules
        this.post('/register',
            {
                summary: 'Register User (Valibot with Custom Rules)',
                description: 'User registration with custom validation rules',
                tags: ['Validation', 'Valibot']
            },
            validate({
                body: valibot(
                    v.pipe(
                        v.object({
                            username: v.pipe(
                                v.string(),
                                v.minLength(3, 'Username must be at least 3 characters'),
                                v.maxLength(20, 'Username must not exceed 20 characters'),
                                v.regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
                            ),
                            password: v.pipe(
                                v.string(),
                                v.minLength(8, 'Password must be at least 8 characters'),
                                v.regex(/[A-Z]/, 'Password must contain at least one uppercase letter'),
                                v.regex(/[a-z]/, 'Password must contain at least one lowercase letter'),
                                v.regex(/[0-9]/, 'Password must contain at least one number')
                            ),
                            confirmPassword: v.string()
                        }),
                        v.forward(
                            v.partialCheck(
                                [['password'], ['confirmPassword']],
                                (input) => input.password === input.confirmPassword,
                                'Passwords do not match'
                            ),
                            ['confirmPassword']
                        )
                    ),
                    v.parse
                )
            }),
            async (ctx) => {
                const { username } = await ctx.body();
                return ctx.json({
                    message: 'User registered successfully',
                    username,
                    validator: 'Valibot'
                }, 201);
            }
        );

        // Example 6: Optional and Nullable Fields
        this.patch('/update/:id',
            {
                summary: 'Update User (Valibot)',
                description: 'Update user with optional and nullable fields',
                tags: ['Validation', 'Valibot']
            },
            validate({
                params: valibot(
                    v.object({
                        id: v.pipe(v.string(), v.regex(/^\d+$/))
                    }),
                    v.parse
                ),
                body: valibot(
                    v.object({
                        name: v.optional(v.pipe(v.string(), v.minLength(3))),
                        email: v.optional(v.pipe(v.string(), v.email())),
                        age: v.optional(v.pipe(v.number(), v.integer(), v.minValue(18))),
                        bio: v.nullable(v.string())
                    }),
                    v.parse
                )
            }),
            async (ctx) => {
                const { id } = ctx.params;
                const updates = await ctx.body();

                return ctx.json({
                    message: 'User updated successfully',
                    userId: id,
                    updates,
                    validator: 'Valibot'
                });
            }
        );

        // Example 7: Array Validation with Transformations
        this.post('/batch-update',
            {
                summary: 'Batch Update (Valibot)',
                description: 'Batch update with array validation and transformations',
                tags: ['Validation', 'Valibot']
            },
            validate({
                body: valibot(
                    v.object({
                        updates: v.pipe(
                            v.array(
                                v.object({
                                    id: v.pipe(v.string(), v.transform(Number)),
                                    status: v.picklist(['active', 'inactive', 'pending']),
                                    priority: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10))
                                })
                            ),
                            v.minLength(1),
                            v.maxLength(50)
                        )
                    }),
                    v.parse
                )
            }),
            async (ctx) => {
                const { updates } = await ctx.body();
                return ctx.json({
                    message: `${updates.length} items updated successfully`,
                    count: updates.length,
                    validator: 'Valibot'
                });
            }
        );
    }
}
