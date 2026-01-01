---
title: CLI Tools
description: Shokupan command-line tools
---

Shokupan includes a CLI for scaffolding and code generation.

## Installation

```bash
# Install globally
bun add -g shokupan

# Or use with bunx
bunx shokupan
```

## Commands

### Generate Controller

```bash
shokupan generate controller User
# or
skp g controller User
```

Generates:
```typescript
import { Get, Post, Put, Delete, Param, Body } from 'shokupan';

export class UserController {
    @Get('/')
    async getAll() {
        return { users: [] };
    }
    
    @Get('/:id')
    async getById(@Param('id') id: string) {
        return { id };
    }
    
    @Post('/')
    async create(@Body() body: any) {
        return { created: body };
    }
    
    @Put('/:id')
    async update(@Param('id') id: string, @Body() body: any) {
        return { id, updated: body };
    }
    
    @Delete('/:id')
    async delete(@Param('id') id: string) {
        return { id, deleted: true };
    }
}
```

### Generate Middleware

```bash
skp g middleware auth
```

### Generate Plugin

```bash
skp g plugin custom
```

## Next Steps

- [Controllers](/shokupan/core/controllers/) - Learn about controllers
- [Middleware](/shokupan/core/middleware/) - Create custom middleware
