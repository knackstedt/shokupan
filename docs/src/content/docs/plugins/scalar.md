---
title: Scalar (OpenAPI)
description: Beautiful interactive API documentation
---

The Scalar plugin provides beautiful, interactive OpenAPI (Swagger) documentation for your API.

## Quick Start

```typescript
import { Shokupan, ScalarPlugin } from 'shokupan';

const app = new Shokupan();

app.mount('/docs', new ScalarPlugin({
    baseDocument: {
        info: {
            title: 'My API',
            version: '1.0.0',
            description: 'API documentation for my application'
        }
    },
    config: {
        theme: 'purple',
        layout: 'modern'
    }
}));

app.listen();
// Documentation available at: http://localhost:3000/docs
```

## Configuration

```typescript
app.mount('/docs', new ScalarPlugin({
    baseDocument: {
        info: {
            title: 'My API',
            version: '1.0.0',
            description: 'Comprehensive API documentation',
            contact: {
                name: 'API Support',
                email: 'support@example.com',
                url: 'https://example.com/support'
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT'
            }
        },
        servers: [
            {
                url: 'https://api.example.com',
                description: 'Production server'
            },
            {
                url: 'https://staging-api.example.com',
                description: 'Staging server'
            },
            {
                url: 'http://localhost:3000',
                description: 'Development server'
            }
        ]
    },
    config: {
        theme: 'purple',      // 'purple', 'blue', 'green', etc.
        layout: 'modern',     // 'modern' or 'classic'
        showSidebar: true,
        hideDownloadButton: false
    }
}));
```

## Automatic OpenAPI Generation

Shokupan automatically generates OpenAPI specs from your routes and controllers. You can enhance them with metadata:

```typescript
app.get('/users/:id', {
    summary: 'Get user by ID',
    description: 'Retrieves a single user by their unique identifier',
    tags: ['Users'],
    parameters: [{
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'User ID'
    }],
    responses: {
        200: {
            description: 'User found',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            email: { type: 'string' }
                        }
                    }
                }
            }
        },
        404: {
            description: 'User not found'
        }
    }
}, (ctx) => {
    return { id: ctx.params.id, name: 'Alice', email: 'alice@example.com' };
});
```

## Themes

Available themes:
- `purple` (default)
- `blue`
- `green`
- `red`
- `orange`
- `yellow`
- `dark`
- `light`

```typescript
config: {
    theme: 'blue'
}
```

## Security

Add authentication to your docs in production:

```typescript
const docsAuth = async (ctx, next) => {
    // Basic auth for docs
    const auth = ctx.headers.get('authorization');
    
    if (!auth || !validateDocsAuth(auth)) {
        ctx.set('WWW-Authenticate', 'Basic realm="Documentation"');
        return ctx.status(401);
    }
    
    return next();
};

if (process.env.NODE_ENV === 'production') {
    app.use('/docs', docsAuth);
}

app.mount('/docs', new ScalarPlugin({...}));
```

## Next Steps

- [OpenAPI Generation](/advanced/openapi/) - Advanced OpenAPI features
- [Validation](/plugins/validation/) - Generate schemas from validators
- [Controllers](/core/controllers/) - Document controller endpoints
