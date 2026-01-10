import { ShokupanContext } from '../../../src/context';
import { Body, Ctx, Delete, Event, Get, Param, Patch, Post, Put, Query } from '../../../src/util/decorators';

/**
 * Decorator-Based Controller Example
 * 
 * This controller demonstrates all available decorators in Shokupan:
 * - Route decorators: @Get, @Post, @Put, @Delete, @Patch
 * - Parameter decorators: @Body, @Query, @Param, @Header, @Ctx
 * - OpenAPI metadata via decorators
 */
export class DecoratorTestController {

    @Event("lime")
    limeEvent(@Ctx() ctx) {
        ctx.emit("dime", { message: Date.now() });
    }

    // @Event("crime")
    // crimeEvent(@Ctx() ctx) {
    //     ctx.emit("time", { message: Date.now() });
    // }

    // Example 1: Basic GET route
    @Get('/')
    getRoot() {
        return {
            message: 'Decorator controller root',
            decorators: ['@Get']
        };
    }

    @Get('/product')
    getProduct(): Promise<{ id: number, price: number; }> {
        return Promise.resolve({ id: 1, price: 100 });
    }

    // Example 2: GET with path parameter
    @Get('/:id')
    getUserById(@Param('id') id: string) {
        return {
            message: 'Get user by ID',
            userId: id,
            decorators: ['@Get', '@Param']
        };
    }

    // Example 3: GET with query parameters
    @Get('/search')
    searchUsers(@Query('q') query: string, @Query('limit') limit?: string) {
        return {
            message: 'Search users',
            query,
            limit: limit ? parseInt(limit) : 10,
            decorators: ['@Get', '@Query'],
            results: []
        };
    }

    // Example 4: POST with body
    @Post('/create')
    createUser(@Body() userData: any) {
        return {
            message: 'User created',
            data: userData,
            decorators: ['@Post', '@Body']
        };
    }

    // Example 5: POST with context to access headers
    @Post('/register')
    registerUser(
        @Body() body: any,
        @Ctx() ctx: ShokupanContext
    ) {
        const userAgent = ctx.get('user-agent');
        const apiKey = ctx.get('x-api-key');

        return {
            message: 'User registered',
            username: body.username,
            userAgent,
            hasApiKey: !!apiKey,
            decorators: ['@Post', '@Body', '@Ctx']
        };
    }

    // Example 6: PUT with param and body
    @Put('/update/:id')
    updateUser(@Param('id') id: string, @Body() updates: any) {
        return {
            message: 'User updated',
            userId: id,
            updates,
            decorators: ['@Put', '@Param', '@Body']
        };
    }

    // Example 7: PATCH with multiple params
    @Patch('/users/:userId/posts/:postId')
    updatePost(
        @Param('userId') userId: string,
        @Param('postId') postId: string,
        @Body() updates: any
    ) {
        return {
            message: 'Post updated',
            userId,
            postId,
            updates,
            decorators: ['@Patch', '@Param', '@Body']
        };
    }

    // Example 8: DELETE route
    @Delete('/delete/:id')
    deleteUser(@Param('id') id: string) {
        return {
            message: 'User deleted',
            userId: id,
            decorators: ['@Delete', '@Param']
        };
    }

    // Example 9: Access to full context with @Ctx
    @Get('/context-demo')
    contextDemo(@Ctx() ctx: ShokupanContext) {
        return {
            message: 'Full context access',
            method: ctx.method,
            path: ctx.path,
            ip: ctx.ip?.address,
            hostname: ctx.hostname,
            decorators: ['@Get', '@Ctx']
        };
    }

    // Example 10: Multiple query parameters
    @Get('/filter')
    filterItems(
        @Query('category') category: string,
        @Query('minPrice') minPrice?: string,
        @Query('maxPrice') maxPrice?: string,
        @Query('inStock') inStock?: string
    ) {
        return {
            message: 'Filter results',
            filters: {
                category,
                minPrice: minPrice ? parseFloat(minPrice) : undefined,
                maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
                inStock: inStock === 'true'
            },
            decorators: ['@Get', '@Query']
        };
    }

    // Example 11: Complex route with all decorators
    @Post('/complex/:resourceId')
    complexRoute(
        @Param('resourceId') resourceId: string,
        @Query('action') action: string,
        @Body() payload: any,
        @Ctx() ctx: ShokupanContext
    ) {
        const auth = ctx.get('authorization');

        return {
            message: 'Complex operation',
            resourceId,
            action,
            payload,
            hasAuth: !!auth,
            clientIp: ctx.ip?.address,
            decorators: ['@Post', '@Param', '@Query', '@Body', '@Ctx']
        };
    }

    // Example 12: Async route handler
    @Post('/async-create')
    async asyncCreateUser(@Body() userData: any) {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 100));

        return {
            message: 'User created asynchronously',
            data: userData,
            decorators: ['@Post', '@Body'],
            createdAt: new Date().toISOString()
        };
    }

    // Example 13: Route with custom response
    @Get('/custom-response')
    async customResponse(@Ctx() ctx: ShokupanContext) {
        // You can use ctx to send custom responses
        return ctx.json({
            message: 'Custom response via context',
            timestamp: Date.now(),
            decorators: ['@Get', '@Ctx']
        }, 200);
    }

    // Example 14: HTML response
    @Get('/html')
    htmlResponse(@Ctx() ctx: ShokupanContext) {
        return ctx.html(`
            <!DOCTYPE html>
            <html>
                <head><title>Decorator Example</title></head>
                <body>
                    <h1>HTML Response from Decorator</h1>
                    <p>This demonstrates using @Ctx to return HTML</p>
                </body>
            </html>
        `);
    }

    // Example 15: Redirect example
    @Get('/redirect')
    redirectExample(@Ctx() ctx: ShokupanContext) {
        return ctx.redirect('/');
    }

    // Example 16: File download example
    @Get('/download/:filename')
    downloadFile(@Param('filename') filename: string, @Ctx() ctx: ShokupanContext) {
        // This is a demo - in production you'd validate the filename
        return ctx.json({
            message: 'File download endpoint',
            filename,
            note: 'In production, use ctx.file() to serve actual files',
            decorators: ['@Get', '@Param', '@Ctx']
        });
    }

    // Example 17: Mixed param types
    @Get('/users/:userId/settings/:settingKey')
    getUserSetting(
        @Param('userId') userId: string,
        @Param('settingKey') settingKey: string,
        @Query('default') defaultValue?: string
    ) {
        return {
            message: 'Get user setting',
            userId,
            settingKey,
            defaultValue,
            decorators: ['@Get', '@Param', '@Query']
        };
    }
}
