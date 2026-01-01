---
title: Configuration
description: Configure your Shokupan application
---

The `Shokupan` class accepts a configuration object to customize behavior.

## Basic Configuration

```typescript
const app = new Shokupan({
    port: 3000,
    hostname: 'localhost',
    development: process.env.NODE_ENV !== 'production'
});
```

## Options Reference

### Server Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `port` | `number` | `3000` | The port the server should listen on. |
| `hostname` | `string` | `'localhost'` | The hostname to bind to. |
| `reusePort` | `boolean` | `false` | Allow multiple processes to bind to the same port. |
| `serverFactory` | `ServerFactory` | `Bun.serve` | Custom server factory (e.g., for Node.js support). |

### Application Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `development` | `boolean` | `auto` | Enable development mode (affects error pages, etc.). |
| `enableAsyncLocalStorage` | `boolean` | `false` | Enable `AsyncLocalStorage` for request-scoped globals. |
| `controllersOnly` | `boolean` | `false` | If true, disables `app.get()`, `app.post()` etc., enforcing controller-only architecture. |

### Features

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enableTracing` | `boolean` | `false` | Enable OpenTelemetry tracing integration. |
| `enableOpenApiGen` | `boolean` | `true` | Enable automatic OpenAPI specification generation. |
| `enableMiddlewareTracking` | `boolean` | `false` | Track middleware execution for debugging (required for Debug Dashboard). |

### Timeouts & Limits

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `readTimeout` | `number` | `30000` | Timeout for reading the request body (ms). |
| `requestTimeout` | `number` | `0` (disabled) | Global timeout for processing requests (ms). |

### Auto Backpressure

Protect your server from overload by shedding load when CPU usage is high.

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `autoBackpressureFeedback` | `boolean` | `false` | Enable automatic load shedding. |
| `autoBackpressureLevel` | `number` | `60` | CPU usage % threshold to start rejecting requests with 503. |
