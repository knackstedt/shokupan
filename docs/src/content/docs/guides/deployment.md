---
title: Deployment
description: Deploy your Shokupan application
---

## Using Bun

```bash
bun run src/index.ts
```

## Node.js & Deno
Shokupan is built for Bun, but can run on Node.js and Deno using the server adapter.

### Node.js
Use the `createHttpServer` factory:

```typescript
import { Shokupan, createHttpServer } from 'shokupan';

const app = new Shokupan({
    serverFactory: createHttpServer()
});

app.listen(3000);
```

Then run with `node`:
```bash
node dist/index.js
```

### Deno
Deno support is experimental but uses the same adapter pattern if needed, or runs natively if Deno implements `Bun.serve` compatibility layer in the future. Currently, use the Node compatibility layer in Deno:
```bash
deno run -A dist/index.js
```


```dockerfile
FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production

COPY . .

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
```

Build and run:

```bash
docker build -t my-app .
docker run -p 3000:3000 my-app
```

## Environment Variables

Create a `.env` file:

```bash
PORT=3000
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret
```

Load in your app:

```typescript
const app = new Shokupan({
    port: parseInt(process.env.PORT || '3000'),
    development: process.env.NODE_ENV !== 'production'
});
```

## Production Checklist

- [ ] Use environment variables for secrets
- [ ] Enable HTTPS
- [ ] Set security headers
- [ ] Configure CORS properly
- [ ] Add rate limiting
- [ ] Use production database
- [ ] Set up logging
- [ ] Configure monitoring
