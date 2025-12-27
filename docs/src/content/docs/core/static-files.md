---
title: Static Files
description: Serve static files and directories
---

Shokupan provides built-in support for serving static files with optional directory listing.

## Basic Usage

Serve files from a directory:

```typescript
import { Shokupan } from 'shokupan';

const app = new Shokupan();

// Serve static files from ./public
app.static('/public', {
    root: './public'
});

app.listen();
```

Now files in `./public` are accessible:
- `./public/style.css` → `http://localhost:3000/public/style.css`
- `./public/script.js` → `http://localhost:3000/public/script.js`
- `./public/images/logo.png` → `http://localhost:3000/public/images/logo.png`

## Directory Listing

Enable directory browsing:

```typescript
app.static('/files', {
    root: './files',
    listDirectory: true  // Enable directory listing
});
```

When you visit `http://localhost:3000/files/`, you'll see a list of files and subdirectories.

## Multiple Static Directories

Serve from multiple directories:

```typescript
// Public assets
app.static('/public', {
    root: './public',
    listDirectory: true
});

// Images
app.static('/images', {
    root: './assets/images',
    listDirectory: false
});

// JavaScript bundles
app.static('/js', {
    root: './dist/js',
    listDirectory: false
});

// CSS stylesheets
app.static('/css', {
    root: './dist/css',
    listDirectory: false
});
```

## Root Path

Serve files at the root path:

```typescript
// Serve from root
app.static('/', {
    root: './public'
});

// Now accessible at:
// ./public/index.html → http://localhost:3000/index.html
```

## Typical Project Structure

```
my-app/
├── public/
│   ├── index.html
│   ├── favicon.ico
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── app.js
│   └── images/
│       └── logo.png
└── src/
    └── index.ts
```

Configuration:

```typescript
app.static('/public', {
    root: './public',
    listDirectory: true
});

// Or serve at root for SPA
app.static('/', {
    root: './public'
});
```

## SPA (Single Page Application)

For SPAs, serve your build directory and handle client-side routing:

```typescript
import { Shokupan } from 'shokupan';

const app = new Shokupan();

// API routes
app.get('/api/users', (ctx) => ({ users: [] }));
app.get('/api/posts', (ctx) => ({ posts: [] }));

// Serve static files
app.static('/', {
    root: './dist'
});

// Fallback to index.html for client-side routing
app.get('/*', (ctx) => {
    return ctx.file('./dist/index.html', {
        type: 'text/html'
    });
});

app.listen();
```

## File Types

Shokupan automatically sets the correct `Content-Type` header based on file extension:

- `.html` → `text/html`
- `.css` → `text/css`
- `.js` → `application/javascript`
- `.json` → `application/json`
- `.png` → `image/png`
- `.jpg`, `.jpeg` → `image/jpeg`
- `.svg` → `image/svg+xml`
- `.pdf` → `application/pdf`
- And many more...

## Security Considerations

:::caution[Security]
Be careful when enabling directory listing in production. Only enable it for directories you want to be publicly browsable.
:::

```typescript
// ✅ Safe - specific public directory
app.static('/public', {
    root: './public',
    listDirectory: true
});

// ❌ Dangerous - entire project
app.static('/', {
    root: '.',
    listDirectory: true
});
```

## Caching Headers

Add cache control headers:

```typescript
const staticMiddleware = async (ctx, next) => {
    const result = await next();
    
    // Add cache headers for static assets
    if (ctx.path.startsWith('/public')) {
        ctx.set('Cache-Control', 'public, max-age=31536000');
    }
    
    return result;
};

app.use(staticMiddleware);

app.static('/public', {
    root: './public'
});
```

## Custom 404

Handle missing static files:

```typescript
app.static('/files', {
    root: './files',
    listDirectory: true
});

// Fallback for 404
app.get('/files/*', (ctx) => {
    return ctx.html('<h1>File Not Found</h1>', 404);
});
```

## Development vs Production

Different configurations for environments:

```typescript
const isDev = process.env.NODE_ENV !== 'production';

app.static('/public', {
    root: './public',
    listDirectory: isDev  // Only in development
});

if (isDev) {
    // Development-specific static routes
    app.static('/docs', {
        root: './docs',
        listDirectory: true
    });
}
```

## Next Steps

- [Routing](/core/routing/) - Learn about dynamic routing
- [Middleware](/core/middleware/) - Add caching and compression
- [Compression Plugin](/plugins/compression/) - Compress static assets
