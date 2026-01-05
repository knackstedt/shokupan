---
title: Advanced Features
description: Deep dive into advanced Shokupan features.
---

## Automatic Backpressure

Protect your server from overload by shedding load when CPU usage is high. This functionality is built-in and requires no external dependencies.

### Configuration

```typescript
const app = new Shokupan({
    // Monitor CPU and reject requests when usage > 80%
    autoBackpressureFeedback: true,
    autoBackpressureLevel: 80 
});
```

### Behavior
- Passively monitors system CPU usage.
- If usage exceeds `autoBackpressureLevel`, new requests are immediately rejected with `503 Service Unavailable`.
- This prevents the event loop from becoming completely unresponsive during spikes.

## Middleware Tracking

For debugging complex applications, you can enable middleware tracking to see the exact execution path of a request.

### Configuration

```typescript
const app = new Shokupan({
    enableMiddlewareTracking: true
});
```

### Usage

When enabled, the `ctx.handlerStack` property will contain an array of all handlers and middleware that have executed for the current request.

This is also required for the [Debug Dashboard](/plugins/debug-dashboard) to visualize the request flow.
