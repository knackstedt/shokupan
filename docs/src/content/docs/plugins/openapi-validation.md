---
title: OpenAPI Validation
description: Validate requests against your OpenAPI specification
---

Shokupan provides a powerful way to enforce your API contract by validating incoming requests directly against your generated OpenAPI specification.

## Overview

Instead of maintaining separate validation schemas (like Zod) that might drift from your OpenAPI spec, Shokupan can:
1. Generate the OpenAPI spec at startup.
2. Compile high-performance [Ajv](https://ajv.js.org/) validators from that spec.
3. Validate every request against the defined schema before it reaches your handler.

## Installation

The validation plugin is built-in, but requires `ajv` and `ajv-formats`:

```bash
bun add ajv ajv-formats
```

## Enabling the Flow

To set up the "Spec-First" validation flow where validation schemas are prepared before the server starts listening:

```typescript
import { Shokupan } from 'shokupan';
import { enableOpenApiValidation } from 'shokupan/plugins/openapi-validator';

const app = new Shokupan({
    // Enable OpenAPI generation (required)
    enableOpenApiGen: true,
    port: 3000
});

// Enable the validation flow
enableOpenApiValidation(app);

// ... mount routes ...

await app.listen();
```

### How it works
1. **Boot**: When you call `app.listen()`, the server starts up.
2. **Generation**: It generates the full OpenAPI spec from your code and decorators.
3. **Compilation**: The `onSpecAvailable` hook triggers, compiling Ajv validators for every path and method operation in your spec.
4. **Listening**: The server binds to the port and accepts requests.

## Usage with Controllers

Define your routes as usual. The validator infers types from usage or respects explicit specs.

```typescript
import { Controller, Get, Post, Body } from 'shokupan/decorators';
import { ShokupanContext } from 'shokupan';

@Controller('/users')
class UserController {
    
    @Post('/')                  // Explicit spec overrides inference if needed
    createUser(ctx: ShokupanContext) {
        // Request body is validated against schema!
        // If invalid, 400 Bad Request is returned automatically.
        return ctx.json({ created: true });
    }

    @Get('/:id')
    getUser(ctx: ShokupanContext) {
        // ctx.params.id is validated
        return ctx.json({ id: ctx.params.id });
    }
}
```

## Validation Errors

When a request fails validation (body, query, params, or headers), Shokupan returns a `400 Bad Request` with details:

```json
{
  "error": "Validation Error",
  "details": [
    {
      "location": "body",
      "message": "must have required property 'email'",
      "params": { "missingProperty": "email" }
    }
  ]
}
```

## Comparison with Zod/Runtime Validation

| Feature | OpenAPI Validation | Runtime Validation (Zod/Valibot) |
|---------|-------------------|----------------------------------|
| **Source of Truth** | OpenAPI Spec | TypeScript Code |
| **Maintenance** | Single definition | separate schema vs spec |
| **Performance** | High (Pre-compiled Ajv) | High |
| **Flexibility** | Rigid (Spec-compliant) | Flexible (Custom rules) |

Use OpenAPI Validation when you want strictly enforced API contracts. Use Runtime Validation when you need complex custom logic or conditional validation not easily expressible in OpenAPI.
