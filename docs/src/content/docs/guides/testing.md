---
title: Testing
description: Test your Shokupan applications
---

Shokupan applications are easy to test using Bun's built-in test runner or other testing frameworks.

## Basic Testing

```typescript
import { describe, it, expect } from 'bun:test';
import { Shokupan } from 'shokupan';

describe('My App', () => {
    it('should return hello world', async () => {
        const app = new Shokupan();
        
        app.get('/', () => ({ message: 'Hello' }));
        
        // Process request without starting server
        const res = await app.processRequest({
            method: 'GET',
            path: '/'
        });
        
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ message: 'Hello' });
    });
    
    it('should handle POST requests', async () => {
        const app = new Shokupan();
        
        app.post('/users', async (ctx) => {
            const body = await ctx.body();
            return { created: body };
        });
        
        const res = await app.processRequest({
            method: 'POST',
            path: '/users',
            body: { name: 'Alice' }
        });
        
        expect(res.status).toBe(200);
        expect(res.data.created).toEqual({ name: 'Alice' });
    });
});
```

## Testing Controllers

```typescript
import { describe, it, expect } from 'bun:test';

class UserController {
    @Get('/:id')
    getUser(@Param('id') id: string) {
        return { id, name: 'Test User' };
    }
}

describe('UserController', () => {
    it('should get user by id', async () => {
        const app = new Shokupan();
        app.mount('/users', UserController);
        
        const res = await app.processRequest({
            method: 'GET',
            path: '/users/123'
        });
        
        expect(res.data).toEqual({ id: '123', name: 'Test User' });
    });
});
```

## Next Steps

- [Deployment](/shokupan/guides/deployment/) - Deploy your app
- [CLI Tools](/shokupan/guides/cli/) - Code generation
