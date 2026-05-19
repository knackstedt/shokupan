---
title: Vite
description: Seamless integration with Vite for fullstack development.
---

The `VitePlugin` integrates a Vite frontend application with Shokupan, enabling a single-command fullstack development experience with hot reload for both backend and frontend.

## Usage

```typescript
import { Shokupan, VitePlugin } from 'shokupan';

const app = new Shokupan({ development: true });

app.get('/api/hello', (ctx) => ({ message: 'Hello from Shokupan!' }));

await app.register(new VitePlugin());
await app.listen(3000);
```

Then start development with a single command:

```bash
shokupan dev
```

## How It Works

### Development Mode

When `development: true` (the default when `NODE_ENV` is not `production`), the plugin:

1. **Auto-discovers** your `vite.config.*` file in the project root.
2. **Starts a Vite dev server** internally on an available port.
3. **Proxies unmatched requests** to the Vite dev server, so your frontend assets, HMR, and SPA routes work seamlessly.
4. **Preserves your API routes** — any request that matches a Shokupan route is handled by Shokupan.

This means you can run `shokupan dev` and get hot reload for both your backend (via Bun `--watch`) and your frontend (via Vite HMR) without any npm scripts.

### Production Mode

In production, the plugin:

1. **Reads your Vite build output directory** from `vite.config.*` (defaulting to `dist`).
2. **Serves static files** from the build output.
3. **Provides SPA fallback**: unmatched HTML requests serve `index.html` for client-side routing.

## Options

| Option | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `path` | `string` | No | URL prefix to mount the Vite app under. Defaults to `'/'`. |
| `configFile` | `string` | No | Absolute path to `vite.config.*`. Auto-detected if omitted. |
| `root` | `string` | No | Vite project root. Auto-detected if omitted. |
| `spaFallback` | `boolean` | No | Whether to fallback unmatched routes to `index.html`. Defaults to `true`. |
| `outDir` | `string` | No | Production build output directory. Auto-detected from Vite config if omitted. |

## Examples

### Custom Mount Path

Mount your Vite app under `/app` while keeping API routes at `/api`:

```typescript
await app.register(new VitePlugin({ path: '/app' }));
```

Ensure your Vite `base` config matches the mount path for correct asset URLs.

### Explicit Config File

If your Vite config is in a non-standard location:

```typescript
await app.register(new VitePlugin({
    configFile: './frontend/vite.config.ts'
}));
```

### Disable SPA Fallback

If you do not need SPA routing (e.g., a multi-page app):

```typescript
await app.register(new VitePlugin({ spaFallback: false }));
```

## CLI

The `shokupan dev` command provides a zero-config development experience:

```bash
shokupan dev                  # Auto-detects entry file
shokupan dev --entry src/main.ts --port 3000
```

It auto-discovers your entry file from common locations (`src/main.ts`, `src/index.ts`, `main.ts`, `index.ts`, `app.ts`) and runs it with `bun --watch` so your backend restarts on file changes.

## Requirements

- **Vite** must be installed in your project (`bun add -d vite`).
- The plugin is registered as an optional peer dependency.

## Important Notes

- **Register VitePlugin last** so that your API routes are matched first.
- In production, run your Vite build (`vite build`) before starting the Shokupan server.
