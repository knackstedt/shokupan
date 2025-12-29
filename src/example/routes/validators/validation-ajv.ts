import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { validate } from '../../../plugins/validation';
import { ShokupanRouter } from '../../../router';

/**
 * Ajv Validation Examples
 * 
 * This router demonstrates schema validation using Ajv.
 * Ajv is a fast JSON schema validator.
 */

// Create Ajv instance with formats
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

export class AjvValidationRouter extends ShokupanRouter {
    constructor() {
        super({
            name: 'Ajv Validation Examples',
            group: 'validation'
        });

        // Example 1: Body Validation
        this.post('/create-user',
            {
                summary: 'Create User (Ajv)',
                description: 'Create a user with Ajv body validation',
                tags: ['Validation', 'Ajv']
            },
            validate({
                body: ajv.compile({
                    type: 'object',
                    properties: {
                        name: { type: 'string', minLength: 3, maxLength: 50 },
                        email: { type: 'string', format: 'email' },
                        age: { type: 'integer', minimum: 18, maximum: 120 },
                        role: { type: 'string', enum: ['user', 'admin', 'moderator'] }
                    },
                    required: ['name', 'email', 'age'],
                    additionalProperties: false
                })
            }),
            async (ctx) => {
                const userData = await ctx.body();
                return ctx.json({
                    message: 'User created successfully!',
                    data: userData,
                    validator: 'Ajv'
                }, 201);
            }
        );

        // Example 2: Query Parameter Validation
        this.get('/search',
            {
                summary: 'Search Users (Ajv)',
                description: 'Search users with Ajv query parameter validation',
                tags: ['Validation', 'Ajv']
            },
            validate({
                query: ajv.compile({
                    type: 'object',
                    properties: {
                        q: { type: 'string', minLength: 1 },
                        page: { type: 'string', pattern: '^\\d+$' },
                        limit: { type: 'string', pattern: '^\\d+$' },
                        verified: { type: 'string', enum: ['true', 'false'] }
                    },
                    required: ['q']
                })
            }),
            (ctx) => {
                const query = ctx.query;
                return ctx.json({
                    message: 'Search results',
                    query,
                    validator: 'Ajv',
                    results: []
                });
            }
        );

        // Example 3: Path Parameter Validation
        this.get('/user/:id',
            {
                summary: 'Get User by ID (Ajv)',
                description: 'Fetch user with Ajv path parameter validation',
                tags: ['Validation', 'Ajv']
            },
            validate({
                params: ajv.compile({
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' }
                    },
                    required: ['id']
                })
            }),
            (ctx) => {
                const { id } = ctx.params;
                return ctx.json({
                    message: 'User found',
                    userId: id,
                    validator: 'Ajv',
                    user: {
                        id,
                        name: 'Alice Johnson',
                        email: 'alice@example.com'
                    }
                });
            }
        );

        // Example 4: Complex Nested Objects
        this.post('/create-order',
            {
                summary: 'Create Order (Ajv)',
                description: 'Create an order with nested object validation',
                tags: ['Validation', 'Ajv']
            },
            validate({
                body: ajv.compile({
                    type: 'object',
                    properties: {
                        customerId: { type: 'string', format: 'uuid' },
                        items: {
                            type: 'array',
                            minItems: 1,
                            items: {
                                type: 'object',
                                properties: {
                                    productId: { type: 'string' },
                                    quantity: { type: 'integer', minimum: 1 },
                                    price: { type: 'number', exclusiveMinimum: 0 }
                                },
                                required: ['productId', 'quantity', 'price']
                            }
                        },
                        shipping: {
                            type: 'object',
                            properties: {
                                address: { type: 'string', minLength: 5 },
                                city: { type: 'string' },
                                zipCode: { type: 'string', pattern: '^\\d{5}(-\\d{4})?$' },
                                country: { type: 'string', minLength: 2, maxLength: 2 }
                            },
                            required: ['address', 'city', 'zipCode', 'country']
                        },
                        paymentMethod: { type: 'string', enum: ['credit_card', 'paypal', 'bank_transfer'] }
                    },
                    required: ['customerId', 'items', 'shipping', 'paymentMethod']
                })
            }),
            async (ctx) => {
                const order = await ctx.body();
                const total = order.items.reduce((sum: number, item: any) => sum + (item.quantity * item.price), 0);

                return ctx.json({
                    message: 'Order created successfully',
                    orderId: crypto.randomUUID(),
                    total,
                    validator: 'Ajv'
                }, 201);
            }
        );

        // Example 5: Conditional Validation
        this.post('/create-account',
            {
                summary: 'Create Account (Ajv with Conditionals)',
                description: 'Create account with conditional validation rules',
                tags: ['Validation', 'Ajv']
            },
            validate({
                body: ajv.compile({
                    type: 'object',
                    properties: {
                        accountType: { type: 'string', enum: ['personal', 'business'] },
                        email: { type: 'string', format: 'email' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        companyName: { type: 'string' },
                        taxId: { type: 'string' }
                    },
                    required: ['accountType', 'email'],
                    if: {
                        properties: { accountType: { const: 'business' } }
                    },
                    then: {
                        required: ['companyName', 'taxId']
                    },
                    else: {
                        required: ['firstName', 'lastName']
                    }
                })
            }),
            async (ctx) => {
                const account = await ctx.body();
                return ctx.json({
                    message: 'Account created successfully',
                    accountType: account.accountType,
                    validator: 'Ajv'
                }, 201);
            }
        );

        // Example 6: Pattern Properties
        this.post('/set-metadata',
            {
                summary: 'Set Metadata (Ajv)',
                description: 'Set metadata with pattern-based property validation',
                tags: ['Validation', 'Ajv']
            },
            validate({
                body: ajv.compile({
                    type: 'object',
                    properties: {
                        entityId: { type: 'string' }
                    },
                    patternProperties: {
                        '^meta_': { type: 'string' },
                        '^flag_': { type: 'boolean' },
                        '^count_': { type: 'integer', minimum: 0 }
                    },
                    required: ['entityId'],
                    additionalProperties: false
                })
            }),
            async (ctx) => {
                const data = await ctx.body();
                return ctx.json({
                    message: 'Metadata set successfully',
                    data,
                    validator: 'Ajv'
                });
            }
        );
    }
}
