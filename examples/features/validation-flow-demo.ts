
import { ShokupanContext } from '../../src/context';
import { Shokupan } from '../../src/shokupan';
import { Get, Post } from '../decorators';
import { enableOpenApiValidation } from '../plugins/openapi-validator';

// 1. Define a Controller with Decorators
class UserController {
    @Get('/users/:id')
    getUser(ctx: ShokupanContext) {
        // In a real app, you might validate more, but here 
        // the openapi-validator will handle schema-based validation if spec is present
        const id = parseInt(ctx.params.id);
        return ctx.json({ id, name: "User " + id });
    }

    @Post('/users')
    createUser(ctx: ShokupanContext) {
        // The validator will ensure body matches inferred schema or manual spec
        return ctx.json({ created: true });
    }
}

async function main() {
    // 2. Initialize App
    const app = new Shokupan({
        port: 4000,
        enableOpenApiGen: true,
    });

    // 3. Enable OpenAPI Validation Flow
    // This configures the middleware and the hook:
    // - Server boots up
    // - Server generates OpenAPI spec
    // - Server compiles validation schemas (via onSpecAvailable hook)
    // - Server starts listening
    enableOpenApiValidation(app);

    app.mount('/api', new UserController());

    // 4. Start Server
    // The sequence inside listen() will trigger generation and then compilation.
    await app.listen();

    console.log('Server flow demonstration started on port 4000');

    // 5. Verification Requests (Self-test)
    console.log('\n--- Verifying Flow ---');

    const baseUrl = 'http://localhost:4000/api';

    // Test 1: Valid GET
    console.log('Test 1: GET /users/123 (Valid)');
    const res1 = await fetch(`${baseUrl}/users/123`);
    console.log('Status:', res1.status);
    console.log('Body:', await res1.text());

    // Test 2: Valid POST (with body)
    // Note: Implicit body schema usually requires manual spec or better inference.
    // In our implementation, if no body schema in spec, validation passes.
    // Let's rely on what the generator produces.
    console.log('\nTest 2: POST /users');
    const res2 = await fetch(`${baseUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' })
    });
    console.log('Status:', res2.status);
    console.log('Body:', await res2.text());

    process.exit(0);
}

main().catch(console.error);
