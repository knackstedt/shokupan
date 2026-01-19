---
title: Cluster
description: Enable multi-core utilization with built-in clustering.
---

The Cluster plugin enables your Shokupan application to utilize multiple CPU cores, improving performance and reliability. It supports both Node.js and Bun runtimes.

## Features

- **Multi-core Support**: Automatically spawns workers based on available CPU cores.
- **Runtime Agnostic**: Works seamlessly with both Node.js (via `node:cluster`) and Bun (via `Bun.spawn`/`SO_REUSEPORT`).
- **Sticky Sessions**: (Node.js only) Supports sticky sessions for stateful connections like Socket.IO.
- **Auto-Restart**: Automatically restarts workers if they crash.

## Installation

The Cluster plugin is included in the `shokupan` package.

```typescript
import { Shokupan, ClusterPlugin } from 'shokupan';

const app = new Shokupan();

app.register(new ClusterPlugin({
    workers: 4 // number of workers, or 'auto'
}));
```

## Configuration

The `ClusterPlugin` accepts the following options:

```typescript
interface ClusterOptions {
    /**
     * Number of workers to spawn.
     * Set to -1 or 'auto' to spawn one worker per available CPU.
     * @default 'auto'
     */
    workers?: number | 'auto';

    /**
     * Whether to pipe stdout/stderr to the parent process.
     * @default false
     */
    silent?: boolean;

    /**
     * Enable sticky sessions (useful for Socket.io).
     * Currently only supported in Node.js runtime.
     * @default false
     */
    sticky?: boolean;
}
```

## How It Works

### Bun Runtime
In Bun, the plugin uses `Bun.spawn` to create worker processes. It leverages Bun's native `reusePort` functionality, allowing multiple workers to listen on the same port and having the kernel distribute incoming connections.

### Node.js Runtime
In Node.js, it uses the standard `cluster` module. The primary process forks workers, and they share the listening port.

### Sticky Sessions (Node.js)
When `sticky: true` is enabled, the primary process listens on the port and pauses incoming connections. It then calculates a hash based on the client's IP address and passes the connection handle to a specific worker, ensuring that requests from the same IP always go to the same process. This is essential for applications using Socket.IO without a dedicated Redis adapter.
