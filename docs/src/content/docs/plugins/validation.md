---
title: Validation
description: Validate request data automatically via TypeScript AST inference, or explicitly with Zod, TypeBox, Ajv, or Valibot
---

Shokupan provides two complementary approaches to validation:

1. **TypeScript AST Inference** — Zero-config, zero-runtime-overhead. Shokupan statically analyses your TypeScript source code to automatically infer request and response schemas used for OpenAPI generation, the Debug Dashboard, and request analysis.
2. **Runtime Validation** — Explicit validation middleware using your preferred library (Zod, TypeBox, Ajv, or Valibot) that throws on bad input at request time.

---

## TypeScript AST Inference (Zero-Config)

> **This feature is unique to Shokupan.** No other comparable framework reads your TypeScript source to automatically derive schemas for your routes.

When Shokupan starts, it launches a **background worker thread** that runs the TypeScript compiler API against your source files. The analyzer walks the AST of every route handler and controller method to extract:

- **Request body schema** — from `ctx.body() as MyType` or handler parameter types
- **Query parameter types** — from `ctx.query.fieldName` access and coercion calls (`parseInt`, `parseFloat`, `Boolean`)
- **Path parameter types** — from `ctx.params.id` access patterns
- **Response schema** — from explicit return type annotations or `ctx.json({...})` call shapes

The analysis happens **asynchronously in a background worker thread** and never blocks startup. Results feed directly into:
- Auto-generated OpenAPI specifications (no annotations required)
- The Debug Dashboard's route inspector and middleware tracker
- The API Explorer's request shape previews

:::tip[Pre-compile in CI for zero startup cost]
For large codebases you can run `bunx shokupan generate --ast` in your CI/CD pipeline to output a static `shokupan-ast.json`. Shokupan detects this file on startup and skips the worker thread entirely, giving you the same schemas with no analysis overhead. See [Pre-compiling AST Generation](/guides/ast-generation/) for the full CI workflow.
:::

### Functional Routes

The analyzer understands several patterns automatically:

```typescript
// Pattern 1: Type assertion on ctx.body()
// The analyzer reads `as { name: string; email: string }` from the source
app.post('/users', async (ctx) => {
    const body = await ctx.body() as { name: string; email: string };
    return { created: body };
});

// Pattern 2: Explicit return type annotation
// The analyzer reads the `Promise<{ id: string; name: string }>` return type
app.get('/users/:id', async (ctx): Promise<{ id: string; name: string }> => {
    return { id: ctx.params.id, name: 'Alice' };
});

// Pattern 3: Query parameter coercion inference
// ctx.query.page used with parseInt → inferred as integer
// ctx.query.name used directly → inferred as string
app.get('/search', (ctx) => {
    const page = parseInt(ctx.query.page);
    const name = ctx.query.name;
    return { page, name };
});

// Pattern 4: Inline metadata object (also used for OpenAPI)
app.post('/products', {
    summary: 'Create a product',
    tags: ['products'],
}, async (ctx) => {
    const body = await ctx.body() as { name: string; price: number };
    return { created: body };
});
```

### Controller Methods

The AST analyzer fully supports decorator-based controllers. It reads parameter decorator types and method return type annotations:

```typescript
interface CreateUserDto {
    name: string;
    email: string;
    age: number;
}

interface UserResponse {
    id: string;
    name: string;
    email: string;
}

@Controller('/users')
export class UserController {

    // Return type annotation → inferred response schema
    @Get('/:id')
    async getUser(@Param('id') id: string): Promise<UserResponse> {
        return { id, name: 'Alice', email: 'alice@example.com' };
    }

    // @Body() parameter type → inferred request body schema
    @Post('/')
    async createUser(@Body() body: CreateUserDto): Promise<UserResponse> {
        return { id: 'new-id', ...body };
    }
}
```

### What the Analyzer Detects

| Pattern | Example | Inferred |
|---------|---------|---------|
| Body type assertion | `ctx.body() as MyType` | Request body schema from `MyType` |
| Body param decorator | `@Body() body: MyDto` | Request body schema from `MyDto` |
| Return type annotation | `async (): Promise<MyType>` | Response schema from `MyType` |
| `ctx.json({...})` shape | `ctx.json({ id, name })` | Response schema from object shape |
| Query param access | `ctx.query.page` | Query param `page: string` |
| Query with `parseInt` | `parseInt(ctx.query.page)` | Query param `page: integer` |
| Query with `parseFloat` | `parseFloat(ctx.query.price)` | Query param `price: number` |
| `@Query()` decorator | `@Query('q') q: string` | Query param `q: string` |
| `@Param()` decorator | `@Param('id') id: string` | Path param `id: string` |
| `@Headers()` decorator | `@Headers('x-api-key') k: string` | Header `x-api-key: string` |

### Limitations

The AST inference is static analysis — it reads your **TypeScript source files**, not the compiled output. There are some things it cannot detect:

- **Dynamic types**: If your body type is a runtime variable (e.g., `ctx.body() as typeof mySchema`), the analyzer cannot resolve it.
- **External type re-exports without source**: Types imported from `node_modules` that don't ship `.d.ts` may not be fully resolved.
- **Conditional/union types in handlers**: Complex conditional logic producing different response shapes may only capture one branch.

For these cases, use the **explicit validation** and **inline OpenAPI metadata** approaches described below, or use `@Spec()` to provide an override.

:::note
The AST worker runs automatically in development mode. In production, it only runs when [`ScalarPlugin`](/plugins/scalar/), [`DashboardPlugin`](/plugins/dashboard/), or [`APIExplorerPlugin`](/plugins/api-explorer/) are mounted. For CI/CD deployments, **pre-compiling** the AST with `bunx shokupan generate --ast` eliminates the worker entirely — see [Pre-compiling AST Generation](/guides/ast-generation/).
:::

---

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

## Class Validator Validation

[Class Validator](https://github.com/typestack/class-validator) uses decorators for validation:

```bash
bun add class-validator class-transformer reflect-metadata
```

```typescript
import { IsString, MinLength, IsEmail, Min } from 'class-validator';
import { validate } from 'shokupan';

class UserDto {
    @IsString()
    @MinLength(2)
    name: string;

    @IsEmail()
    email: string;

    @Min(18)
    age: number;
}

app.post('/users',
    validate({ body: UserDto }),
    async (ctx) => {
        const user = await ctx.body(); // Typed as UserDto instance
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

- [Controllers](/core/controllers/) - Use validation with controllers
- [Authentication](/plugins/authentication/) - Secure your API
- [OpenAPI](/advanced/openapi/) - Generate API docs from schemas
