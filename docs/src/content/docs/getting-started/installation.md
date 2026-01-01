---
title: Installation
description: Install Shokupan and set up your first project
---

## Prerequisites

Shokupan requires [Bun](https://bun.sh/) to be installed on your system.

### Install Bun

If you don't have Bun installed yet:

```bash
# macOS, Linux, and WSL
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1|iex"
```

Verify the installation:

```bash
bun --version
```

## Installing Shokupan

Install Shokupan in your project:

```bash
bun add shokupan
```

## Create Your First App

### 1. Initialize a new project

```bash
mkdir my-shokupan-app
cd my-shokupan-app
bun init -y
```

### 2. Install Shokupan

```bash
bun add shokupan
```

### 3. Create your server

Create a file named `index.ts`:

```typescript
import { Shokupan } from 'shokupan';

const app = new Shokupan({
    port: 3000,
    development: true
});

app.get('/', (ctx) => {
    return { message: 'Hello, Shokupan!' };
});

app.get('/users/:id', (ctx) => {
    return {
        id: ctx.params.id,
        name: 'Alice',
        email: 'alice@example.com'
    };
});

app.post('/users', async (ctx) => {
    const body = await ctx.body();
    return {
        message: 'User created',
        data: body
    };
});

console.log('🍞 Server running at http://localhost:3000');
app.listen();
```

### 4. Run your server

```bash
bun run index.ts
```

Your server is now running! Open `http://localhost:3000` in your browser.

## Development Mode

For automatic reloading during development, use the `--watch` flag:

```bash
bun --watch index.ts
```

Now your server will automatically restart when you make changes to your code.

## Project Structure

A typical Shokupan project structure might look like:

```
my-shokupan-app/
├── src/
│   ├── controllers/
│   │   ├── user.controller.ts
│   │   └── post.controller.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── logger.ts
│   ├── services/
│   │   └── user.service.ts
│   └── main.ts
├── package.json
└── tsconfig.json
```

## TypeScript Configuration

For the best experience, configure your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun-types"],
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}
```

The important settings for Shokupan are:
- `experimentalDecorators: true` - Required for controller decorators
- `emitDecoratorMetadata: true` - Enables metadata for dependency injection

## Next Steps

Now that you have Shokupan installed, learn about:

- [Quick Start Guide](/shokupan/getting-started/quick-start/) - Build your first real application
- [Routing](/shokupan/core/routing/) - Learn about routing and path parameters
- [Controllers](/shokupan/core/controllers/) - Use decorators for structured APIs
- [Middleware](/shokupan/core/middleware/) - Add cross-cutting concerns
