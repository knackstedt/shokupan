---
title: Graceful Shutdown
description: Gracefully handle server termination, finish active requests, and clean up resources
---

The `GracefulShutdown` plugin provides a robust way to handle process termination signals (like `SIGINT` and `SIGTERM`) in your Shokupan application. It ensures that active HTTP connections are given time to complete before the server shuts down, and it allows you to clean up resources cleanly.

## Installation

This plugin is included with Shokupan.

```typescript
import { GracefulShutdown } from 'shokupan';

app.use(GracefulShutdown({
    signals: ['SIGINT', 'SIGTERM'],
    timeout: 30000,
    forceExit: true
}));
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `signals` | `string[]` | `['SIGINT', 'SIGTERM']` | List of process signals to listen for. |
| `timeout` | `number` | `30000` | Maximum time (in milliseconds) to wait for active connections to close before forcefully exiting. |
| `forceExit` | `boolean` | `true` | If true, forcefully exits the process (using `process.exit`) after the server has stopped or the timeout is reached. |

## How it Works

When the application receives a designated signal:

1. It immediately stops accepting new connections (responds with `503 Service Unavailable`).
2. It waits for any currently active requests to finish processing.
3. Once all connections are closed (or the `timeout` is reached), it calls `app.stop(false)`.
4. During `app.stop()`, any registered `onStop` hooks and `@OnStop()` decorators will be executed.
5. Finally, the process exits with the appropriate exit code.

## Cleaning up resources

You can use the `@OnStop()` decorator on your controllers or the `onStop` router hook to perform cleanup tasks like closing database connections or stopping background workers.

```typescript
import { Controller, OnStop } from 'shokupan';

@Controller('/users')
export class UsersController {
    
    @OnStop()
    async onShutdown() {
        console.log("Shutting down Users Controller...");
        // Close DB connections, flush logs, etc.
    }
}
```

Or using router hooks:

```typescript
app.hook('onStop', async () => {
    console.log("Global shutdown hook running...");
});
```
