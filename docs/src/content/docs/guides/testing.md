---
title: Testing
description: Test your Shokupan applications with popular JavaScript test runners
---

Shokupan provides powerful testing utilities that work seamlessly with popular JavaScript test runners. This guide covers testing with Bun Test, Jest, Vitest, and Mocha.

## Table of Contents

- [Testing Methods](#testing-methods)
  - [testRequest()](#testrequest)
  - [internalRequest()](#internalrequest)
- [Bun Test](#bun-test)
  - [Basic Tests](#basic-tests)
  - [Testing Middleware](#testing-middleware)
  - [Testing Controllers](#testing-controllers)
  - [Testing Internal Requests](#testing-internal-requests)
- [Jest](#jest)
- [Vitest](#vitest)
- [Mocha](#mocha)
- [Testing Routers Directly](#testing-routers-directly)
- [Testing with Plugins](#testing-with-plugins)
- [Best Practices](#best-practices)
- [Coverage](#coverage)

## Testing Methods

Shokupan provides two primary methods for testing your applications:

### `testRequest()`

A testing utility that processes requests and returns a simplified result object. This method:
- Goes through the **full application stack** (middleware, hooks, error handling)
- Returns `{ status, headers, data }` for easy assertions
- Automatically parses JSON responses
- Perfect for integration tests

```typescript
const result = await app.testRequest({
    method: 'GET',
    path: '/users',
    headers: { 'Authorization': 'Bearer token' },
    body: { name: 'Alice' },
    query: { page: '1' }
});

// result = { status: 200, headers: {...}, data: {...} }
```

### `internalRequest()`

Makes an internal request through the full routing pipeline. This method:
- Returns a raw `Response` object
- Supports streaming responses
- Useful for testing route proxying and internal requests
- Ideal for testing Response headers and status codes directly

```typescript
const response = await app.internalRequest({
    path: '/api/users',
    method: 'POST',
    body: { name: 'Bob' }
});

// response is a standard Response object
const data = await response.json();
```

## Bun Test

Shokupan works perfectly with [Bun's built-in test runner](https://bun.sh/docs/cli/test), which is blazingly fast and requires no configuration.

### Setup

```bash
# No installation needed - Bun includes the test runner
bun test
```

### Basic Tests

```typescript
import { describe, it, expect } from 'bun:test';
import { Shokupan } from 'shokupan';

describe('API Tests', () => {
    it('should return hello world', async () => {
        const app = new Shokupan();
        
        app.get('/', () => ({ message: 'Hello World' }));
        
        const res = await app.testRequest({
            method: 'GET',
            path: '/'
        });
        
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ message: 'Hello World' });
    });
    
    it('should handle POST requests', async () => {
        const app = new Shokupan();
        
        app.post('/users', async (ctx) => {
            const body = await ctx.body();
            return { created: body };
        });
        
        const res = await app.testRequest({
            method: 'POST',
            path: '/users',
            body: { name: 'Alice', email: 'alice@example.com' }
        });
        
        expect(res.status).toBe(200);
        expect(res.data.created).toEqual({ 
            name: 'Alice', 
            email: 'alice@example.com' 
        });
    });
});
```

### Testing Middleware

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { Shokupan } from 'shokupan';

describe('Middleware Tests', () => {
    let app: Shokupan;
    
    beforeEach(() => {
        app = new Shokupan();
    });
    
    it('should execute middleware in order', async () => {
        const calls: string[] = [];
        
        app.use(async (ctx, next) => {
            calls.push('middleware1');
            return next?.();
        });
        
        app.use(async (ctx, next) => {
            calls.push('middleware2');
            return next?.();
        });
        
        app.get('/', () => {
            calls.push('handler');
            return 'ok';
        });
        
        await app.testRequest({ path: '/' });
        
        expect(calls).toEqual(['middleware1', 'middleware2', 'handler']);
    });
    
    it('should handle authentication middleware', async () => {
        app.use(async (ctx, next) => {
            const token = ctx.req.headers.get('Authorization');
            if (!token) {
                return ctx.json({ error: 'Unauthorized' }, 401);
            }
            return next?.();
        });
        
        app.get('/protected', () => ({ data: 'secret' }));
        
        // Test without auth
        const unauthorized = await app.testRequest({ path: '/protected' });
        expect(unauthorized.status).toBe(401);
        
        // Test with auth
        const authorized = await app.testRequest({
            path: '/protected',
            headers: { 'Authorization': 'Bearer token123' }
        });
        expect(authorized.status).toBe(200);
        expect(authorized.data).toEqual({ data: 'secret' });
    });
});
```

### Testing Controllers

```typescript
import { describe, it, expect } from 'bun:test';
import { Shokupan } from 'shokupan';
import { Get, Post, Param, Body } from 'shokupan';

class UserController {
    @Get('/')
    getUsers() {
        return [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
        ];
    }
    
    @Get('/:id')
    getUser(@Param('id') id: string) {
        return { id, name: 'Test User' };
    }
    
    @Post('/')
    createUser(@Body() body: any) {
        return { id: 3, ...body };
    }
}

describe('UserController', () => {
    it('should get all users', async () => {
        const app = new Shokupan();
        app.mount('/users', UserController);
        
        const res = await app.testRequest({
            method: 'GET',
            path: '/users'
        });
        
        expect(res.status).toBe(200);
        expect(res.data).toHaveLength(2);
    });
    
    it('should get user by id', async () => {
        const app = new Shokupan();
        app.mount('/users', UserController);
        
        const res = await app.testRequest({
            method: 'GET',
            path: '/users/123'
        });
        
        expect(res.data).toEqual({ id: '123', name: 'Test User' });
    });
});
```

### Testing Internal Requests

```typescript
import { describe, it, expect } from 'bun:test';
import { Shokupan, ShokupanRouter } from 'shokupan';

describe('Internal Request Tests', () => {
    it('should make internal requests between routes', async () => {
        const app = new Shokupan();
        const router = new ShokupanRouter();
        
        // Target route
        router.get('/wines/red', () => ({ type: 'red', varieties: ['Merlot', 'Cabernet'] }));
        router.get('/wines/white', () => ({ type: 'white', varieties: ['Chardonnay', 'Riesling'] }));
        
        // Proxy route that calls other routes internally
        router.get('/wines/all', async (ctx) => {
            const [red, white] = await Promise.all([
                router.internalRequest('/api/wines/red'),
                router.internalRequest('/api/wines/white')
            ]);
            
            return {
                red: await red.json(),
                white: await white.json()
            };
        });
        
        app.mount('/api', router);
        
        const res = await app.testRequest({ path: '/api/wines/all' });
        
        expect(res.status).toBe(200);
        expect(res.data.red.type).toBe('red');
        expect(res.data.white.type).toBe('white');
    });
});
```

## Jest

[Jest](https://jestjs.io/) is a popular testing framework with great TypeScript support.

### Setup

```bash
npm install --save-dev jest @types/jest ts-jest
```

**jest.config.js:**
```javascript
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
    collectCoverageFrom: ['src/**/*.ts']
};
```

### Example Tests

```typescript
import { Shokupan } from 'shokupan';

describe('Shokupan with Jest', () => {
    let app: Shokupan;
    
    beforeEach(() => {
        app = new Shokupan();
    });
    
    afterEach(() => {
        // Cleanup if needed
    });
    
    describe('GET /health', () => {
        it('should return 200 OK', async () => {
            app.get('/health', () => ({ status: 'ok' }));
            
            const response = await app.testRequest({
                method: 'GET',
                path: '/health'
            });
            
            expect(response.status).toBe(200);
            expect(response.data).toMatchObject({ status: 'ok' });
        });
    });
    
    describe('Error Handling', () => {
        it('should return 404 for unknown routes', async () => {
            const response = await app.testRequest({
                path: '/unknown-route'
            });
            
            expect(response.status).toBe(404);
        });
        
        it('should handle errors gracefully', async () => {
            app.get('/error', () => {
                throw new Error('Test error');
            });
            
            const response = await app.testRequest({ path: '/error' });
            
            expect(response.status).toBe(500);
            expect(response.data).toHaveProperty('error');
        });
    });
});
```

### Snapshot Testing

```typescript
describe('API Response Snapshots', () => {
    it('should match snapshot', async () => {
        const app = new Shokupan();
        app.get('/api/data', () => ({
            version: '1.0.0',
            items: [1, 2, 3]
        }));
        
        const response = await app.testRequest({ path: '/api/data' });
        
        expect(response.data).toMatchSnapshot();
    });
});
```

## Vitest

[Vitest](https://vitest.dev/) is a blazing-fast test runner compatible with Jest's API.

### Setup

```bash
npm install --save-dev vitest
```

**vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html']
        }
    }
});
```

### Example Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Shokupan } from 'shokupan';

describe('Shokupan with Vitest', () => {
    let app: Shokupan;
    
    beforeEach(() => {
        app = new Shokupan();
    });
    
    it('should handle query parameters', async () => {
        app.get('/search', (ctx) => {
            const query = ctx.req.query.get('q');
            return { results: [`Result for: ${query}`] };
        });
        
        const response = await app.testRequest({
            path: '/search',
            query: { q: 'test' }
        });
        
        expect(response.status).toBe(200);
        expect(response.data.results).toContain('Result for: test');
    });
    
    it('should handle path parameters', async () => {
        app.get('/users/:id/posts/:postId', (ctx) => ({
            userId: ctx.params.id,
            postId: ctx.params.postId
        }));
        
        const response = await app.testRequest({
            path: '/users/42/posts/123'
        });
        
        expect(response.data).toEqual({
            userId: '42',
            postId: '123'
        });
    });
});
```

## Mocha

[Mocha](https://mochajs.org/) is a flexible testing framework often paired with Chai for assertions.

### Setup

```bash
npm install --save-dev mocha @types/mocha chai @types/chai ts-node
```

**test/mocha.opts:**
```
--require ts-node/register
--require source-map-support/register
--recursive
--extension ts
```

### Example Tests

```typescript
import { expect } from 'chai';
import { Shokupan } from 'shokupan';

describe('Shokupan with Mocha', () => {
    let app: Shokupan;
    
    beforeEach(() => {
        app = new Shokupan();
    });
    
    describe('JSON Handling', () => {
        it('should parse and return JSON', async () => {
            app.post('/api/echo', async (ctx) => {
                const body = await ctx.body();
                return { echo: body };
            });
            
            const response = await app.testRequest({
                method: 'POST',
                path: '/api/echo',
                headers: { 'Content-Type': 'application/json' },
                body: { message: 'hello' }
            });
            
            expect(response.status).to.equal(200);
            expect(response.data).to.deep.equal({
                echo: { message: 'hello' }
            });
        });
    });
    
    describe('Headers', () => {
        it('should set custom headers', async () => {
            app.get('/custom-headers', (ctx) => {
                return ctx.text('OK', 200, {
                    'X-Custom-Header': 'CustomValue'
                });
            });
            
            const response = await app.testRequest({
                path: '/custom-headers'
            });
            
            expect(response.headers['x-custom-header']).to.equal('CustomValue');
        });
    });
});
```

## Testing Routers Directly

You can test `ShokupanRouter` instances independently from the application. This is useful for testing modular router logic, API route groups, or reusable router components.

### Key Differences

When testing routers directly:
- **Router.testRequest()** bypasses application-level middleware
- Only router-specific middleware (via `router.use()`) is executed
- No application hooks are triggered
- Useful for unit testing router logic in isolation

### Basic Router Testing

```typescript
import { describe, it, expect } from 'bun:test';
import { ShokupanRouter } from 'shokupan';

describe('API Router', () => {
    it('should test router independently', async () => {
        const router = new ShokupanRouter();
        
        router.get('/items', () => ({ items: [] }));
        router.get('/items/:id', (ctx) => ({
            id: ctx.params.id,
            name: 'Item'
        }));
        router.post('/items', async (ctx) => {
            const body = await ctx.body();
            return { created: body };
        });
        
        // Test GET /items
        const listRes = await router.testRequest({
            method: 'GET',
            path: '/items'
        });
        expect(listRes.status).toBe(200);
        expect(listRes.data).toEqual({ items: [] });
        
        // Test GET /items/:id
        const getRes = await router.testRequest({
            path: '/items/123'
        });
        expect(getRes.data.id).toBe('123');
        
        // Test POST /items
        const createRes = await router.testRequest({
            method: 'POST',
            path: '/items',
            body: { name: 'New Item' }
        });
        expect(createRes.data.created).toEqual({ name: 'New Item' });
    });
});
```

### Testing Router Middleware

Test middleware that applies only to specific routers:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { ShokupanRouter } from 'shokupan';

describe('Router Middleware', () => {
    let router: ShokupanRouter;
    
    beforeEach(() => {
        router = new ShokupanRouter();
    });
    
    it('should apply router-level middleware', async () => {
        const calls: string[] = [];
        
        // Router-level middleware
        router.use(async (ctx, next) => {
            calls.push('router-middleware');
            return next?.();
        });
        
        router.get('/test', () => {
            calls.push('handler');
            return { success: true };
        });
        
        await router.testRequest({ path: '/test' });
        
        expect(calls).toEqual(['router-middleware', 'handler']);
    });
    
    it('should handle router-level guards', async () => {
        // Add authentication guard to router
        router.guard({ description: 'Auth Guard' }, async (ctx, next) => {
            const apiKey = ctx.req.headers.get('X-API-Key');
            if (apiKey !== 'secret') {
                return ctx.json({ error: 'Unauthorized' }, 401);
            }
            return next?.();
        });
        
        router.get('/protected', () => ({ data: 'sensitive' }));
        
        // Test without API key
        const unauthorized = await router.testRequest({
            path: '/protected'
        });
        expect(unauthorized.status).toBe(401);
        
        // Test with API key
        const authorized = await router.testRequest({
            path: '/protected',
            headers: { 'X-API-Key': 'secret' }
        });
        expect(authorized.status).toBe(200);
        expect(authorized.data).toEqual({ data: 'sensitive' });
    });
});
```

### Testing Nested Routers

```typescript
import { describe, it, expect } from 'bun:test';
import { ShokupanRouter } from 'shokupan';

describe('Nested Routers', () => {
    it('should test nested router structure', async () => {
        const apiRouter = new ShokupanRouter();
        const usersRouter = new ShokupanRouter();
        const postsRouter = new ShokupanRouter();
        
        // Users router
        usersRouter.get('/', () => ({ users: [] }));
        usersRouter.get('/:id', (ctx) => ({
            id: ctx.params.id,
            name: 'User'
        }));
        
        // Posts router
        postsRouter.get('/', () => ({ posts: [] }));
        postsRouter.post('/', async (ctx) => {
            const body = await ctx.body();
            return { created: body };
        });
        
        // Mount routers
        apiRouter.mount('/users', usersRouter);
        apiRouter.mount('/posts', postsRouter);
        
        // Test users routes (note: paths include /users prefix)
        const usersRes = await apiRouter.testRequest({
            path: '/users'
        });
        expect(usersRes.data).toEqual({ users: [] });
        
        const userRes = await apiRouter.testRequest({
            path: '/users/42'
        });
        expect(userRes.data.id).toBe('42');
        
        // Test posts routes
        const postsRes = await apiRouter.testRequest({
            path: '/posts'
        });
        expect(postsRes.data).toEqual({ posts: [] });
    });
});
```

### Testing Router with Controllers

```typescript
import { describe, it, expect } from 'bun:test';
import { ShokupanRouter } from 'shokupan';
import { Get, Post, Param } from 'shokupan';

class ProductController {
    @Get('/')
    list() {
        return { products: ['Product 1', 'Product 2'] };
    }
    
    @Get('/:id')
    get(@Param('id') id: string) {
        return { id, name: `Product ${id}` };
    }
}

describe('Router with Controllers', () => {
    it('should test router with mounted controller', async () => {
        const router = new ShokupanRouter();
        router.mount('/products', ProductController);
        
        const listRes = await router.testRequest({
            path: '/products'
        });
        expect(listRes.data.products).toHaveLength(2);
        
        const getRes = await router.testRequest({
            path: '/products/123'
        });
        expect(getRes.data.id).toBe('123');
    });
});
```

### Testing Router Internal Requests

Test routers that make internal requests to other routes:

```typescript
import { describe, it, expect } from 'bun:test';
import { ShokupanRouter } from 'shokupan';

describe('Router Internal Requests', () => {
    it('should handle internal route calls', async () => {
        const router = new ShokupanRouter();
        
        // Data routes
        router.get('/data/cats', () => ({
            category: 'cats',
            items: ['Tabby', 'Siamese']
        }));
        
        router.get('/data/dogs', () => ({
            category: 'dogs',
            items: ['Labrador', 'Poodle']
        }));
        
        // Aggregator route
        router.get('/data/all', async () => {
            const [catsRes, dogsRes] = await Promise.all([
                router.internalRequest('/data/cats'),
                router.internalRequest('/data/dogs')
            ]);
            
            return {
                cats: await catsRes.json(),
                dogs: await dogsRes.json()
            };
        });
        
        const res = await router.testRequest({ path: '/data/all' });
        
        expect(res.status).toBe(200);
        expect(res.data.cats.category).toBe('cats');
        expect(res.data.dogs.category).toBe('dogs');
    });
});
```

### Testing vs Mounting in App

When deciding between testing a router directly or mounting it in an app:

**Test Router Directly:**
```typescript
// Unit test: isolated router logic only
const router = new ShokupanRouter();
router.get('/items', () => ({ items: [] }));

const res = await router.testRequest({ path: '/items' });
// No app middleware, no hooks, fast execution
```

**Test Via App:**
```typescript
// Integration test: full application stack
const app = new Shokupan();
app.use(SomeMiddleware()); // This runs
app.mount('/api', router);

const res = await app.testRequest({ path: '/api/items' });
// Includes middleware, hooks, full app behavior
```

## Testing with Plugins

```typescript
import { describe, it, expect } from 'bun:test';
import { Shokupan } from 'shokupan';
import { Compression } from 'shokupan/plugins';

describe('Plugin Tests', () => {
    it('should compress responses', async () => {
        const app = new Shokupan();
        app.use(Compression());
        
        app.get('/data', () => {
            return 'x'.repeat(1000); // Large response
        });
        
        const response = await app.testRequest({
            path: '/data',
            headers: { 'Accept-Encoding': 'gzip' }
        });
        
        expect(response.status).toBe(200);
        // Response should be compressed if size threshold is met
    });
});
```

## Best Practices

### 1. **Isolate Tests**

Create a new app instance for each test to avoid state pollution:

```typescript
beforeEach(() => {
    app = new Shokupan();
});
```

### 2. **Test Error Cases**

Always test both success and error scenarios:

```typescript
it('should validate input', async () => {
    app.post('/users', async (ctx) => {
        const body = await ctx.body();
        if (!body.email) {
            return ctx.json({ error: 'Email required' }, 400);
        }
        return { success: true };
    });
    
    // Test error case
    const errorRes = await app.testRequest({
        method: 'POST',
        path: '/users',
        body: { name: 'Alice' }
    });
    expect(errorRes.status).toBe(400);
    
    // Test success case
    const successRes = await app.testRequest({
        method: 'POST',
        path: '/users',
        body: { email: 'alice@example.com' }
    });
    expect(successRes.status).toBe(200);
});
```

### 3. **Use Type Safety**

Leverage TypeScript for type-safe tests:

```typescript
interface User {
    id: number;
    name: string;
}

it('should return typed data', async () => {
    app.get('/users/:id', (ctx) => ({
        id: parseInt(ctx.params.id),
        name: 'Alice'
    }));
    
    const response = await app.testRequest({ path: '/users/1' });
    const user = response.data as User;
    
    expect(user.id).toBe(1);
    expect(user.name).toBe('Alice');
});
```

### 4. **Test Async Operations**

Use `async/await` for testing asynchronous routes:

```typescript
it('should handle async operations', async () => {
    app.get('/async', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { done: true };
    });
    
    const response = await app.testRequest({ path: '/async' });
    expect(response.data.done).toBe(true);
});
```

## Coverage

### Bun Test Coverage

```bash
bun test --coverage
```

### Jest Coverage

```bash
npm test -- --coverage
```

### Vitest Coverage

```bash
npx vitest --coverage
```

## Next Steps

- [Deployment](/shokupan/guides/deployment/) - Deploy your app
- [Production Setup](/shokupan/guides/production/) - Production best practices
- [CLI Tools](/shokupan/guides/cli/) - Code generation
