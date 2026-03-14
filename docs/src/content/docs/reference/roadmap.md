---
title: Roadmap
description: Future features and development plans
---

## Features

### Frontend Support (Partially Implemented)
- Built-in support for next.js, remix, nuxt, angular SSR, and sveltekit

### Runtime Compatibility (Partially Implemented)
- Improved support for Deno, Node.js, and WinterCG
- Better Cross-runtime testing

### Framework Plugins (Partially Implemented)
- Drop-in adapters for Express, Koa, Hono, Fastify, Elysia etc.

### Scaling
- Automatic clustering
- Load balancing

### Transmission Format Support
> These may end up just being documentation examples rather than actual plugins
- tRPC/gRPC integration
- Protobuf
- MessagePack
- Streaming JSON/Form-data
- BullMQ
- Nats.js

### Performance
- Improved Bun performance
- Improved NodeJS performance
- Improved multiprocessing support

## Plugins

### New/Revamped Plugins
- Better GraphQL support (sse, ws, endpoints, subscriptions)
- ODataV4
- Database plugin integration (e.g. Prisma, Sequelize, mongoose, redis, knex, pg etc)
- .env file loading, k8s secret mount path loading, environment variable loading
- InversifyJS
- profiling (e.g. 0x)
- superjson
- mime

### Base Plugin features
- Support for plugins with interfaces on service ports instead of the same HTTP server
- Interface for plugin-to-plugin communication

## Contributing

We welcome contributions! Check out our [GitHub repository](https://github.com/knackstedt/shokupan) to get involved.
