---
title: Validation
description: Validate request data with Zod, TypeBox, Ajv, or Valibot
---

Shokupan supports multiple validation libraries, giving you the flexibility to use your preferred validator.

## Zod Validation

[Zod](https://zod.dev/) is the recommended validation library for TypeScript:

```bash
bun add zod
```

### Basic Usage

```typescript
import { validate } from 'shokupan';
import { z } from 'zod';

const userSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    age: z.number().min(18)
});

app.post('/users',
    validate({ body: userSchema }),
    async (ctx) => {
        const body = await ctx.body();  // Already validated!
        return { created: body };
    }
);
```

### Validate Different Parts

```typescript
import { z } from 'zod';

// Body validation
const createUserSchema = z.object({
    name: z.string().min(2),
    email: z.string().email()
});

app.post('/users',
    validate({ body: createUserSchema }),
    async (ctx) => { /* ... */ }
);

// Query validation
const searchSchema = z.object({
    q: z.string(),
    page: z.coerce.number().default(1),
    limit: z.coerce.number().max(100).default(10)
});

app.get('/search',
    validate({ query: searchSchema }),
    (ctx) => {
        const q = ctx.query.get('q');
        const page = ctx.query.get('page');
        return { q, page };
    }
);

// Path parameters validation
app.get('/users/:id',
    validate({
        params: z.object({
            id: z.string().uuid()
        })
    }),
    (ctx) => {
        return { id: ctx.params.id };
    }
);

// Header validation
app.post('/webhook',
    validate({
        headers: z.object({
            'x-webhook-signature': z.string()
        })
    }),
    async (ctx) => {
        // Process webhook
    }
);
```

### Complex Schemas

```typescript
const productSchema = z.object({
    name: z.string().min(1).max(100),
    price: z.number().positive(),
    category: z.enum(['electronics', 'clothing', 'food']),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.string()).optional(),
    inStock: z.boolean().default(true)
});

app.post('/products',
    validate({ body: productSchema }),
    async (ctx) => {
        const product = await ctx.body();
        return { created: product };
    }
);
```

## TypeBox Validation

[TypeBox](https://github.com/sinclairzx81/typebox) provides JSON Schema validation:

```bash
bun add @sinclair/typebox
```

```typescript
import { Type } from '@sinclair/typebox';
import { validate } from 'shokupan';

const UserSchema = Type.Object({
    name: Type.String({ minLength: 2 }),
    email: Type.String({ format: 'email' }),
    age: Type.Number({ minimum: 18 })
});

app.post('/users',
    validate({ body: UserSchema }),
    async (ctx) => {
        const user = await ctx.body();
        return { created: user };
    }
);
```

## Ajv Validation

[Ajv](https://ajv.js.org/) is a fast JSON Schema validator:

```bash
bun add ajv
```

```typescript
import Ajv from 'ajv';
import { validate } from 'shokupan';

const ajv = new Ajv();

const userSchema = ajv.compile({
    type: 'object',
    properties: {
        name: { type: 'string', minLength: 2 },
        email: { type: 'string', format: 'email' },
        age: { type: 'number', minimum: 18 }
    },
    required: ['name', 'email', 'age']
});

app.post('/users',
    validate({ body: userSchema }),
    async (ctx) => {
        const user = await ctx.body();
        return { created: user };
    }
);
```

## Valibot Validation

[Valibot](https://valibot.dev/) is a lightweight alternative:

```bash
bun add valibot
```

```typescript
import * as v from 'valibot';
import { validate, valibot } from 'shokupan';

const UserSchema = v.object({
    name: v.pipe(v.string(), v.minLength(2)),
    email: v.pipe(v.string(), v.email()),
    age: v.pipe(v.number(), v.minValue(18))
});

app.post('/users',
    validate({ 
        body: valibot(UserSchema, v.parseAsync)
    }),
    async (ctx) => {
        const user = await ctx.body();
        return { created: user };
    }
);
```

## Error Handling

Validation errors automatically return 400 responses:

```typescript
// POST /users with invalid data
// {
//   "name": "A",           // Too short
//   "email": "invalid",    // Not an email
//   "age": 15              // Too young
// }

// Response: 400 Bad Request
// {
//   "error": "Validation failed",
//   "details": [
//     {
//       "field": "name",
//       "message": "String must contain at least 2 character(s)"
//     },
//     {
//       "field": "email",
//       "message": "Invalid email"
//     },
//     {
//       "field": "age",
//       "message": "Number must be greater than or equal to 18"
//     }
//   ]
// }
```

## Custom Error Messages

Override default error messages:

```typescript
const userSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please provide a valid email'),
    age: z.number().min(18, 'You must be 18 or older')
});
```

## With Controllers

Use validation with controller decorators:

```typescript
import { Post, Body, Use  } from 'shokupan';
import { validate } from 'shokupan';
import { z } from 'zod';

const createUserSchema = z.object({
    name: z.string().min(2),
    email: z.string().email()
});

export class UserController {
    
    @Post('/')
    @Use(validate({ body: createUserSchema }))
    async createUser(@Body() body: any) {
        return { created: body };
    }
}
```

## Conditional Validation

Validate based on conditions:

```typescript
const createSchema = z.object({
    name: z.string(),
    email: z.string().email()
});

const updateSchema = z.object({
    name: z.string().optional(),
    email: z.string().email().optional()
}).refine(data => data.name || data.email, {
    message: 'At least one field must be provided'
});

app.post('/users', validate({ body: createSchema }), createHandler);
app.put('/users/:id', validate({ body: updateSchema }), updateHandler);
```

## Transform Data

Use validators to transform data:

```typescript
const productSchema = z.object({
    name: z.string().trim().toLowerCase(),
    price: z.string().transform(val => parseFloat(val)),
    tags: z.string().transform(val => val.split(','))
});

app.post('/products',
    validate({ body: productSchema }),
    async (ctx) => {
        const product = await ctx.body();
        // product.name is trimmed and lowercase
        // product.price is a number
        // product.tags is an array
        return { product };
    }
);
```

## Next Steps

- [Controllers](/shokupan/core/controllers/) - Use validation with controllers
- [Authentication](/shokupan/plugins/authentication/) - Secure your API
- [OpenAPI](/shokupan/advanced/openapi/) - Generate API docs from schemas
