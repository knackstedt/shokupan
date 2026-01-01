---
title: Express Middleware
description: Use Express middleware with Shokupan
---

Many Express middleware packages work with Shokupan using the compatibility layer.

## useExpress Adapter

```typescript
import { useExpress } from 'shokupan';
import helmet from 'helmet';

app.use(useExpress(helmet()));
```

## Native Alternatives

For better performance, use native Shokupan plugins:

```typescript
import { SecurityHeaders, Compression, Cors } from 'shokupan';

app.use(SecurityHeaders());
app.use(Compression());
app.use(Cors());
```

## Next Steps

- [Plugins](/shokupan/plugins/cors/) - Native Shokupan plugins
