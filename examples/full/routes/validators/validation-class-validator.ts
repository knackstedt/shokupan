import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import 'reflect-metadata';
import { validate } from '../../../../src/plugins/middleware/validation';
import { ShokupanRouter } from '../../../../src/router';

/**
 * class-validator Examples
 * 
 * This router demonstrates decorator-based class validation using class-validator.
 * class-validator uses decorators to define validation rules on class properties.
 */

// DTOs (Data Transfer Objects) with validation decorators

class CreateUserDto {
    @IsString()
    @MinLength(3)
    @MaxLength(50)
    name!: string;

    @IsEmail()
    email!: string;

    @IsInt()
    @Min(18)
    @Max(120)
    age!: number;

    @IsOptional()
    @IsEnum(['user', 'admin', 'moderator'])
    role?: string;
}

class SearchQueryDto {
    @IsString()
    @MinLength(1)
    q!: string;

    @IsOptional()
    @Matches(/^\d+$/)
    page?: string;

    @IsOptional()
    @Matches(/^\d+$/)
    limit?: string;

    @IsOptional()
    @IsEnum(['true', 'false'])
    verified?: string;
}

class UserIdParamsDto {
    @IsUUID()
    id!: string;
}

class OrderItemDto {
    @IsString()
    productId!: string;

    @IsInt()
    @Min(1)
    quantity!: number;

    @IsNumber()
    @IsPositive()
    price!: number;
}

class ShippingAddressDto {
    @IsString()
    @MinLength(5)
    address!: string;

    @IsString()
    city!: string;

    @Matches(/^\d{5}(-\d{4})?$/)
    zipCode!: string;

    @IsString()
    @MinLength(2)
    @MaxLength(2)
    country!: string;
}

class CreateOrderDto {
    @IsUUID()
    customerId!: string;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => OrderItemDto)
    items!: OrderItemDto[];

    @ValidateNested()
    @Type(() => ShippingAddressDto)
    shipping!: ShippingAddressDto;

    @IsEnum(['credit_card', 'paypal', 'bank_transfer'])
    paymentMethod!: string;
}

class RegisterUserDto {
    @IsString()
    @MinLength(3, { message: 'Username must be at least 3 characters' })
    @MaxLength(20, { message: 'Username must not exceed 20 characters' })
    @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers, and underscores' })
    username!: string;

    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters' })
    @Matches(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
    @Matches(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
    @Matches(/[0-9]/, { message: 'Password must contain at least one number' })
    password!: string;

    @IsString()
    confirmPassword!: string;
}

class UpdateUserDto {
    @IsOptional()
    @IsString()
    @MinLength(3)
    name?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsInt()
    @Min(18)
    age?: number;
}

class UpdateIdParamsDto {
    @Matches(/^\d+$/)
    id!: string;
}

class BulkCreateDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => CreateUserDto)
    users!: CreateUserDto[];
}

export class ClassValidatorRouter extends ShokupanRouter {
    constructor() {
        super({
            name: 'class-validator Examples',
            group: 'validation'
        });

        // Example 1: Body Validation
        this.post('/create-user',
            {
                summary: 'Create User (class-validator)',
                description: 'Create a user with class-validator body validation',
                tags: ['Validation', 'class-validator']
            },
            validate({
                body: CreateUserDto
            }),
            async (ctx) => {
                const userData = await ctx.body();
                return ctx.json({
                    message: 'User created successfully!',
                    data: userData,
                    validator: 'class-validator'
                }, 201);
            }
        );

        // Example 2: Query Parameter Validation
        this.get('/search',
            {
                summary: 'Search Users (class-validator)',
                description: 'Search users with class-validator query parameter validation',
                tags: ['Validation', 'class-validator']
            },
            validate({
                query: SearchQueryDto
            }),
            (ctx) => {
                const query = ctx.query;
                return ctx.json({
                    message: 'Search results',
                    query,
                    validator: 'class-validator',
                    results: []
                });
            }
        );

        // Example 3: Path Parameter Validation
        this.get('/user/:id',
            {
                summary: 'Get User by ID (class-validator)',
                description: 'Fetch user with class-validator path parameter validation',
                tags: ['Validation', 'class-validator']
            },
            validate({
                params: UserIdParamsDto
            }),
            (ctx) => {
                const { id } = ctx.params;
                return ctx.json({
                    message: 'User found',
                    userId: id,
                    validator: 'class-validator',
                    user: {
                        id,
                        name: 'Charlie Brown',
                        email: 'charlie@example.com'
                    }
                });
            }
        );

        // Example 4: Complex Nested Objects
        this.post('/create-order',
            {
                summary: 'Create Order (class-validator)',
                description: 'Create an order with nested object validation',
                tags: ['Validation', 'class-validator']
            },
            validate({
                body: CreateOrderDto
            }),
            async (ctx) => {
                const order = await ctx.body();
                const total = order.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

                return ctx.json({
                    message: 'Order created successfully',
                    orderId: crypto.randomUUID(),
                    total,
                    validator: 'class-validator'
                }, 201);
            }
        );

        // Example 5: Custom Error Messages
        this.post('/register',
            {
                summary: 'Register User (class-validator with Custom Messages)',
                description: 'User registration with custom validation messages',
                tags: ['Validation', 'class-validator']
            },
            validate({
                body: RegisterUserDto
            }),
            async (ctx) => {
                const { username } = await ctx.body();
                return ctx.json({
                    message: 'User registered successfully',
                    username,
                    validator: 'class-validator'
                }, 201);
            }
        );

        // Example 6: Optional Fields
        this.patch('/update/:id',
            {
                summary: 'Update User (class-validator)',
                description: 'Update user with optional fields',
                tags: ['Validation', 'class-validator']
            },
            validate({
                params: UpdateIdParamsDto,
                body: UpdateUserDto
            }),
            async (ctx) => {
                const { id } = ctx.params;
                const updates = await ctx.body();

                return ctx.json({
                    message: 'User updated successfully',
                    userId: id,
                    updates,
                    validator: 'class-validator'
                });
            }
        );

        // Example 7: Array Validation
        this.post('/bulk-create',
            {
                summary: 'Bulk Create Users (class-validator)',
                description: 'Create multiple users with array validation',
                tags: ['Validation', 'class-validator']
            },
            validate({
                body: BulkCreateDto
            }),
            async (ctx) => {
                const { users } = await ctx.body();
                return ctx.json({
                    message: `${users.length} users created successfully`,
                    count: users.length,
                    validator: 'class-validator'
                }, 201);
            }
        );
    }
}
