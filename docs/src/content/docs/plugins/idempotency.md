---
title: Idempotency
description: Prevent duplicate operations with Idempotency middleware.
---

The `Idempotency` middleware ensures that multiple identical requests do not result in different outcomes. It works by caching the response of the first request associated with a specific idempotency key and returning the cached response for subsequent requests.

## Usage

```typescript
import { Idempotency } from 'shokupan';

app.post('/payments', 
    Idempotency({
        header: 'Idempotency-Key',
        ttl: 86400000 // 24 hours
    }), 
    async (ctx) => {
        // ... process payment
        return { status: 'charged' };
    }
);
```

## How it works

1. Client sends a request with an `Idempotency-Key` header.
2. If the key has been seen before, the server returns the saved response (status, headers, body) without executing the handler again.
3. If the key is new, the handler executes, and the resulting response is saved.

## Configuration

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `header` | `string` | `'Idempotency-Key'` | The request header to look for the key. |
| `ttl` | `number` | `86400000` (24h) | Time to live for the cached response (ms). |
