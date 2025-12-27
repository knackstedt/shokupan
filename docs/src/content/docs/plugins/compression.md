---
title: Compression
description: Enable response compression
---

The Compression plugin compresses HTTP responses to reduce bandwidth and improve performance.

## Basic Usage

```typescript
import { Shokupan, Compression } from 'shokupan';

const app = new Shokupan();

app.use(Compression());

app.listen();
```

## Configuration

```typescript
app.use(Compression({
    threshold: 1024,  // Only compress responses larger than 1KB
    level: 6          // Compression level (1-9, default: 6)
}));
```

## Options

- **threshold**: Minimum response size to compress (in bytes, default: 1024)
- **level**: Compression level from 1 (fastest) to 9 (best compression), default: 6

## How It Works

The plugin automatically:
- Checks if the client supports gzip encoding
- Compresses responses larger than the threshold
- Sets appropriate `Content-Encoding` header
- Adjusts `Content-Length` header

## Best Practices

```typescript
// Use default settings for most cases
app.use(Compression());

// For better performance, increase threshold
app.use(Compression({
    threshold: 2048  // 2KB
}));

// For better compression, increase level
app.use(Compression({
    level: 9  // Maximum compression
}));
```

:::tip
Higher compression levels provide better compression but use more CPU. Level 6 is a good balance for most applications.
:::

## Next Steps

- [CORS](/plugins/cors/) - Configure CORS
- [Security Headers](/plugins/security-headers/) - Add security headers
