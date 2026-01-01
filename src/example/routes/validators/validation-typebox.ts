import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { validate } from '../../../plugins/validation';
import { ShokupanRouter } from '../../../router';

// Helper to compile schemas for Shokupan validation
const C = (schema: any) => TypeCompiler.Compile(schema);

/**
 * TypeBox Validation Examples
 * 
 * This router demonstrates schema validation using TypeBox.
 * TypeBox is a JSON schema type builder with static type resolution.
 * Shokupan requires TypeBox schemas to be compiled using TypeCompiler.
 */
export class TypeBoxValidationRouter extends ShokupanRouter {
    constructor() {
        super({
            name: 'TypeBox Validation Examples',
            group: 'validation'
        });

        // Example 1: Body Validation
        this.post('/create-user',
            {
                summary: 'Create User (TypeBox)',
                description: 'Create a user with TypeBox body validation',
                tags: ['Validation', 'TypeBox']
            },
            validate({
                body: C(Type.Object({
                    name: Type.String({ minLength: 3, maxLength: 50 }),
                    email: Type.String({ format: 'email' }),
                    age: Type.Integer({ minimum: 18, maximum: 120 }),
                    role: Type.Optional(Type.Union([
                        Type.Literal('user'),
                        Type.Literal('admin'),
                        Type.Literal('moderator')
                    ]))
                }))
            }),
            async (ctx) => {
                const userData = await ctx.body();
                return ctx.json({
                    message: 'User created successfully!',
                    data: userData,
                    validator: 'TypeBox'
                }, 201);
            }
        );

        // Example 2: Query Parameter Validation
        this.get('/search',
            {
                summary: 'Search Users (TypeBox)',
                description: 'Search users with TypeBox query parameter validation',
                tags: ['Validation', 'TypeBox']
            },
            validate({
                query: C(Type.Object({
                    q: Type.String({ minLength: 1 }),
                    page: Type.Optional(Type.String({ pattern: '^\\d+$' })),
                    limit: Type.Optional(Type.String({ pattern: '^\\d+$' })),
                    verified: Type.Optional(Type.Union([
                        Type.Literal('true'),
                        Type.Literal('false')
                    ]))
                }))
            }),
            (ctx) => {
                const query = ctx.query;
                return ctx.json({
                    message: 'Search results',
                    query,
                    validator: 'TypeBox',
                    results: []
                });
            }
        );

        // Example 3: Path Parameter Validation
        this.get('/user/:id',
            {
                summary: 'Get User by ID (TypeBox)',
                description: 'Fetch user with TypeBox path parameter validation',
                tags: ['Validation', 'TypeBox']
            },
            validate({
                params: C(Type.Object({
                    id: Type.String({ format: 'uuid' })
                }))
            }),
            (ctx) => {
                const { id } = ctx.params;
                return ctx.json({
                    message: 'User found',
                    userId: id,
                    validator: 'TypeBox',
                    user: {
                        id,
                        name: 'Jane Smith',
                        email: 'jane@example.com'
                    }
                });
            }
        );

        // Example 4: Complex Nested Objects
        this.post('/create-order',
            {
                summary: 'Create Order (TypeBox)',
                description: 'Create an order with nested object validation',
                tags: ['Validation', 'TypeBox']
            },
            validate({
                body: C(Type.Object({
                    customerId: Type.String({ format: 'uuid' }),
                    items: Type.Array(
                        Type.Object({
                            productId: Type.String(),
                            quantity: Type.Integer({ minimum: 1 }),
                            price: Type.Number({ minimum: 0, exclusiveMinimum: 0 })
                        }),
                        { minItems: 1 }
                    ),
                    shipping: Type.Object({
                        address: Type.String({ minLength: 5 }),
                        city: Type.String(),
                        zipCode: Type.String({ pattern: '^\\d{5}(-\\d{4})?$' }),
                        country: Type.String({ minLength: 2, maxLength: 2 })
                    }),
                    paymentMethod: Type.Union([
                        Type.Literal('credit_card'),
                        Type.Literal('paypal'),
                        Type.Literal('bank_transfer')
                    ])
                }))
            }),
            async (ctx) => {
                const order = await ctx.body();
                const total = order.items.reduce((sum: number, item: any) => sum + (item.quantity * item.price), 0);

                return ctx.json({
                    message: 'Order created successfully',
                    orderId: crypto.randomUUID(),
                    total,
                    validator: 'TypeBox'
                }, 201);
            }
        );

        // Example 5: Optional and Nullable Fields
        this.patch('/update/:id',
            {
                summary: 'Update User (TypeBox)',
                description: 'Update user with optional fields',
                tags: ['Validation', 'TypeBox']
            },
            validate({
                params: C(Type.Object({
                    id: Type.String({ pattern: '^\\d+$' })
                })),
                body: C(Type.Object({
                    name: Type.Optional(Type.String({ minLength: 3 })),
                    email: Type.Optional(Type.String({ format: 'email' })),
                    age: Type.Optional(Type.Integer({ minimum: 18 })),
                    bio: Type.Union([Type.String(), Type.Null()])
                }))
            }),
            async (ctx) => {
                const { id } = ctx.params;
                const updates = await ctx.body();

                return ctx.json({
                    message: 'User updated successfully',
                    userId: id,
                    updates,
                    validator: 'TypeBox'
                });
            }
        );

        // Example 6: Array and Tuple Validation
        this.post('/bulk-create',
            {
                summary: 'Bulk Create Users (TypeBox)',
                description: 'Create multiple users with array validation',
                tags: ['Validation', 'TypeBox']
            },
            validate({
                body: C(Type.Object({
                    users: Type.Array(
                        Type.Object({
                            name: Type.String({ minLength: 3 }),
                            email: Type.String({ format: 'email' }),
                            age: Type.Integer({ minimum: 18 })
                        }),
                        { minItems: 1, maxItems: 100 }
                    )
                }))
            }),
            async (ctx) => {
                const { users } = await ctx.body();
                return ctx.json({
                    message: `${users.length} users created successfully`,
                    count: users.length,
                    validator: 'TypeBox'
                }, 201);
            }
        );

        // Example 7: Numeric Range Validation
        this.post('/set-price',
            {
                summary: 'Set Product Price (TypeBox)',
                description: 'Set a product price with numeric validation',
                tags: ['Validation', 'TypeBox']
            },
            validate({
                body: C(Type.Object({
                    productId: Type.String(),
                    price: Type.Number({ minimum: 0.01, maximum: 999999.99 }),
                    discount: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
                    currency: Type.String({ minLength: 3, maxLength: 3 })
                }))
            }),
            async (ctx) => {
                const pricing = await ctx.body();
                return ctx.json({
                    message: 'Price set successfully',
                    pricing,
                    validator: 'TypeBox'
                });
            }
        );
    }
}
