---
title: Proxy
description: Forward requests to another server using the Proxy middleware.
---

The `Proxy` middleware allows you to forward requests to another server, acting as a reverse proxy. It supports both HTTP and WebSocket connections.

## Usage

```typescript
import { Proxy } from 'shokupan';

// Forward /api requests to an external API
app.use('/api', Proxy({
    target: 'https://api.external.com',
    changeOrigin: true
}));
```

## Options

| Option | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `target` | `string` | Yes | The target URL to forward requests to. |
| `pathRewrite` | `(path: string) => string` | No | Function to rewrite the URL path before forwarding. |
| `changeOrigin` | `boolean` | No | Changes the origin of the host header to the target URL. |
| `ws` | `boolean` | No | Enable WebSocket proxying. |
| `headers` | `Record<string, string>` | No | Custom headers to add to the forwarded request. |
| `allowedHosts` | `string[]` | No | Whitelist of allowed target hostnames for security. |
| `allowPrivateIPs` | `boolean` | `false` | Allow proxying to private IP ranges (e.g. localhost, 192.168.x.x). |

## Examples

### Path Rewriting

Remove the prefix from the forwarded path:

```typescript
app.use('/api/v1', Proxy({
    target: 'https://api.service.com',
    pathRewrite: (path) => path.replace('/api/v1', '')
}));
// request: /api/v1/users -> target: https://api.service.com/users
```

### WebSocket Proxy

Forward WebSocket connections:

```typescript
app.use('/socket', Proxy({
    target: 'ws://ws.service.com',
    ws: true
}));
```
