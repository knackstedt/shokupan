# Shokupan 🍞

> A delightful, type-safe web framework for Bun

**Built for Developer Experience**
Shokupan is designed to make building APIs delightful again. With zero-config defaults, instant startup times, and full type safety out of the box, you can focus on building your product, not configuring your framework.

> [!CAUTION]
> Shokupan is still in beta and is not guaranteed to be stable. Please use with caution. We will be adding more features and APIs in the future. Please file an issue if you find any bugs or have suggestions for improvement.

📚 **[Full documentation available at https://shokupan.dev](https://shokupan.dev)**

## ✨ Features

- 🎯 **TypeScript First** - End-to-end type safety with decorators and generics. No manual types needed.
- 🛠️ **Zero Config** - Works effectively out of the box. Automatically serves over Local HTTPS with a Debug Dashboard and API Explorer in Dev Mode.
- 🚀 **Built for Bun** - Native [Bun](https://bun.sh/) performance with instant startup.
- 🔍 **Debug Dashboard** - Visual inspector for your routes, middleware, and request flow.
- 📝 **Auto OpenAPI** - Generate [OpenAPI](https://www.openapis.org/) specs automatically from routes.
- 🔌 **Rich Plugin System** - CORS, Sessions, Auth, Validation, Rate Limiting, and more.
- 🌐 **Flexible Routing** - Express-style routes or decorator-based controllers.
- 🔀 **Express Compatible** - Adapter for [Express](https://expressjs.com/) middleware (partial `req`/`res` mock).
- 📊 **OpenTelemetry Plugin** - [OpenTelemetry](https://opentelemetry.io/) instrumentation available via plugin.
- 🔐 **OAuth2 Support** - GitHub, Google, Microsoft, Apple, Auth0, Okta.
- ✅ **Multi-validator Support** - Zod, Ajv, TypeBox, Valibot.
- 📚 **OpenAPI Docs** - Beautiful OpenAPI documentation with [Scalar](https://scalar.dev/).
- ⏩ **Short shift** - Very simple migration from [Express](https://expressjs.com/) or [NestJS](https://nestjs.com/) to Shokupan.

![Shokupan Debug Dashboard](docs/src/assets/dashboard_charts_1.png)


## 🚀 Quick Start

> Bun and TypeScript are required for Shokupan.

```typescript
import { Shokupan, ScalarPlugin } from 'shokupan';
const app = new Shokupan();

app.get('/', (ctx) => ({ message: 'Hello, World!' }));
app.get('/hello', (ctx) => "world");

await app.register(new ScalarPlugin({
    enableStaticAnalysis: true
}));

await app.listen();
```

That's it! In development mode, your server is automatically running securely at `https://localhost:3000` 🎉

### Vite Integration

Shokupan integrates seamlessly with [Vite](https://vitejs.dev/) for fullstack development. One command starts both your backend and frontend with hot reload:

```typescript
import { Shokupan, VitePlugin } from 'shokupan';
const app = new Shokupan({ development: true });

app.get('/api/hello', (ctx) => ({ message: 'Hello from Shokupan!' }));
await app.register(new VitePlugin());
await app.listen(3000);
```

Then run:
```bash
shokupan dev
```

Your API runs on `https://localhost:3000`, and Vite's dev server handles all frontend assets and HMR automatically. In production, the plugin serves your built Vite output with SPA fallback support.

### Development Mode

By default, when `NODE_ENV` is not `production` (or `development: true` in config), Shokupan automatically enhances your developer experience:
- **Local HTTPS:** Generates and trusts a local CA to serve your API over `https://localhost:3000` automatically.
- **Debug Dashboard:** Mounted at `https://localhost:3000/dashboard` to inspect requests and middleware.
- **API Explorer:** Mounted at `https://localhost:3000/dashboard/explorer` to interact with your OpenAPI spec.
- **Detailed Errors:** Uncaught exceptions render a beautiful HTML stack trace instead of a plain text 500.

## 💡 Core Concepts

Shokupan provides a familiar yet modern API.

- **[Routing](https://shokupan.dev/core/routing)**: Express-style routing (`app.get`, `app.post`) with a clean, intuitive API.
- **[Controllers](https://shokupan.dev/core/controllers)**: Decorator-based controllers (`@Controller`, `@Get`) for structured applications.
- **[Middleware](https://shokupan.dev/core/middleware)**: Koa-style async middleware for request processing and flow control.
- **[Context](https://shokupan.dev/core/context)**: A rich `ctx` object containing request, response, parameters, and shared state.
- **[Static Files](https://shokupan.dev/core/static-files)**: Serve static assets with ease.
- **[WebSockets](https://shokupan.dev/core/websockets)**: Native WebSocket handling and HTTP Bridge feature.

## 🎯 Design Philosophy

**Shokupan makes a fundamental design decision: both functional routers and decorative controllers are first-class citizens and fully interoperable.**

You can freely mix and match routing styles based on what works best for your team:
- Use **functional routing** (`app.get()`, `app.post()`) for simple APIs and rapid prototyping
- Use **decorator-based controllers** (`@Get()`, `@Post()`) for structured, enterprise-scale applications
- **Combine both** in the same application - they work seamlessly together

For large applications, we recommend choosing whichever style your team is most comfortable with and sticking with it for consistency. If you encounter any gaps or limitations in either approach, please [file an issue](https://github.com/knackstedt/shokupan/issues) - Shokupan's goal is to solve problems at the fundamental level, not to monkeypatch them.

## 🔌 Plugins

Shokupan has a rich ecosystem of plugins.

| Plugin | Description |
| :--- | :--- |
| **[Dashboard](https://shokupan.dev/plugins/dashboard)** | Visual dashboard for debugging and analysis. |
| **[Error View](https://shokupan.dev/plugins/error-view)** | Beautiful, interactive error pages for development. |
| **[CORS](https://shokupan.dev/plugins/cors)** | Configure Cross-Origin Resource Sharing. |
| **[Compression](https://shokupan.dev/plugins/compression)** | Enable response compression (gzip, deflate, etc.). |
| **[Rate Limiting](https://shokupan.dev/plugins/rate-limiting)** | Protect your API from abuse. |
| **[Security Headers](https://shokupan.dev/plugins/security-headers)** | Add essential security headers (CSP, HSTS, etc.). |
| **[Sessions](https://shokupan.dev/plugins/sessions)** | Session management with connect-style store support. |
| **[Authentication](https://shokupan.dev/plugins/authentication)** | Built-in OAuth2 support (GitHub, Google, etc.). |
| **[Validation](https://shokupan.dev/plugins/validation)** | Validate requests with Zod, Ajv, TypeBox, or Valibot. |
| **[Scalar (OpenAPI)](https://shokupan.dev/plugins/scalar)** | Beautiful, interactive API documentation. |
| **[API Explorer](https://shokupan.dev/plugins/api-explorer)** | Built-in interactive documentation for your API. |
| **[AsyncAPI](https://shokupan.dev/plugins/asyncapi)** | Generate and view documentation for WebSocket APIs. |
| **[Cluster](https://shokupan.dev/plugins/cluster)** | Utilize multiple CPU cores for better performance. |
| **[GraphQL](https://shokupan.dev/plugins/graphql)** | Support for Apollo Server and GraphQL Yoga. |
| **[MCP Server](https://shokupan.dev/plugins/mcp-server)** | Expose your API as tools to LLMs. |
| **[Socket.IO](https://shokupan.dev/plugins/socket-io)** | Easy integration with Socket.IO. |
| **[Proxy](https://shokupan.dev/plugins/proxy)** | Create reverse proxies. |
| **[OpenAPI Validator](https://shokupan.dev/plugins/openapi-validation)** | Validate requests against OpenAPI specs. |
| **[Idempotency](https://shokupan.dev/plugins/idempotency)** | Ensure safe retries for non-idempotent operations. |
| **[Vite](https://shokupan.dev/plugins/vite)** | Seamless integration with Vite for fullstack development. |

## 🚀 Advanced Features

- **[Dependency Injection](https://shokupan.dev/guides/advanced)**: Built-in container for managing dependencies.
- **[OpenAPI Generation](https://shokupan.dev/core/controllers)**: Auto-generate specs from your code.
- **[Sub-Requests](https://shokupan.dev/core/routing)**: Make internal requests without HTTP overhead.
- **[OpenTelemetry](https://shokupan.dev/guides/production)**: Built-in distributed tracing.
- **[Type Augmentation](https://shokupan.dev/guides/global-type-augmentation)**: Extend global types for type-safety.

## 📚 Guides & Reference

- **[Migration Guides](https://shokupan.dev/migration)**: Detailed guides for migrating from Express, Koa, or NestJS.
- **[Testing](https://shokupan.dev/guides/testing)**: How to test your Shokupan application.
- **[Deployment](https://shokupan.dev/guides/deployment)**: Deploying to Bun, Docker, and more.
- **[CLI Reference](https://shokupan.dev/guides/cli)**: Documentation for the Shokupan CLI.
- **[API Reference](https://shokupan.dev/api)**: Complete API documentation.
- **[Roadmap](https://shokupan.dev/reference/roadmap)**: Future plans and features.

## ⚠️ Known Limitations

### HTTP/HTTPS Client Outbound Request Monitoring (Bun Runtime)

When running on Bun, Shokupan has **limited or no visibility** into outbound requests made via the `node:http` and `node:https` clients. This severely limits Shokupan's capability to monitor outgoing HTTP(S) requests. This is caused due to Bun's native networking implementation, which does not yet have support for intercepting these modules.

Requests made via the global `fetch` function are still monitored. Requests from `node:http` and `node:https` can be partially monitored if they are imported via `require` or from the `shokupan` package.


## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Publish the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [Express](https://expressjs.com/), [Koa](https://koajs.com/), [NestJS](https://nestjs.com/), and [Elysia](https://elysiajs.com/)
- Built for the amazing [Bun](https://bun.sh/) runtime
- Powered by [Arctic](https://github.com/pilcrowonpaper/arctic) for OAuth2 support
- Tests and Benchmarks created with Antigravity

---

**Made with ❤️ by the Shokupan team**
