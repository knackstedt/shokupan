---
title: Cluster
description: Enable multi-core utilization with built-in clustering.
---

The Cluster plugin enables your Shokupan application to utilize multiple CPU cores, improving performance and reliability.

## Features

- **Multi-core Support**: Automatically spawns workers based on available CPU cores.
- **Bun Native**: Leverages `Bun.spawn` and `SO_REUSEPORT` for worker distribution.
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
     * @default false
     */
    sticky?: boolean;
}
```

## How It Works

In Bun, the plugin uses `Bun.spawn` to create worker processes. It leverages Bun's native `reusePort` functionality, allowing multiple workers to listen on the same port and having the kernel distribute incoming connections.
