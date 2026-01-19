---
title: HTTP Server Adapter
description: Use standard Node.js HTTP/HTTPS servers with Shokupan.
---

While Shokupan uses Bun's native server by default, the HTTP Server plugin allows you to use standard Node.js `http` and `https` modules. This is useful when deploying on Node.js environments or when you need specific Node.js server features.

## Installation

The HTTP Server plugin is included in the `shokupan` package.

```typescript
import { Shokupan, createHttpServer, createHttpsServer } from 'shokupan';
```

## Usage

You can specify the adapter in the `Shokupan` constructor configuration.

### HTTP Server

```typescript
const app = new Shokupan({
    adapter: 'node' // force node adapter
});

await app.listen(3000);
```

Alternatively, you can manually use the factory functions if you are building a custom startup script or need more control (though `adapter: 'node'` is preferred for general usage).

### HTTPS Server

To use HTTPS with Node.js, you can use `createHttpsServer` as a custom adapter factory.

```typescript
import { readFileSync } from 'fs';
import { createHttpsServer } from 'shokupan';

const sslOptions = {
    key: readFileSync('path/to/key.pem'),
    cert: readFileSync('path/to/cert.pem')
};

const app = new Shokupan({
    // Pass the custom factory
    serverFactory: createHttpsServer(sslOptions)
});

await app.listen(3000); // Now listening on HTTPS
```
