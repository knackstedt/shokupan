---
title: Migrating from NestJS
description: Guide to migrating from NestJS to Shokupan
---

Shokupan supports NestJS-style decorators with a lighter-weight approach.

## Controllers

**NestJS:**
```typescript
@Controller('users')
export class UserController {
    @Get(':id')
    getUser(@Param('id') id: string) {
        return { id };
    }
}
```

**Shokupan:**
```typescript
export class UserController {
    @Get('/:id')
    getUser(@Param('id') id: string) {
        return { id };
    }
}

app.mount('/users', UserController);
```

## Next Steps

- [Controllers](/shokupan/core/controllers/) - Full controller documentation
