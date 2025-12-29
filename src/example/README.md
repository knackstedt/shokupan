# Shokupan Comprehensive Example Application

This is a complete reference application demonstrating **ALL** features of the Shokupan web framework.

## Prerequisites

- [Bun](https://bun.sh) - A fast all-in-one JavaScript runtime
- [Docker](https://www.docker.com/) (optional, for OpenTelemetry trace visualization)

## Quick Start

### 1. Install Dependencies

From the repository root directory:

```bash
bun install
```

### 2. Run the Example Application

```bash
bun run dev
```

This will start the development server at **http://localhost:3001** with hot-reloading enabled.

### 3. Explore the Examples

Visit **http://localhost:3001** to see an overview of all available examples and features.

## Complete Feature List

This example application demonstrates EVERY feature currently implemented in Shokupan:

### 🔒 Validation (5 Libraries)

Each validation library has its own router with comprehensive examples:

- **Zod** `/validation/zod` - TypeScript-first schema validation
- **TypeBox** `/validation/typebox` - JSON Schema Type Builder
- **Ajv** `/validation/ajv` - Fast JSON Schema Validator
- **Valibot** `/validation/valibot` - Modular schema library
- **class-validator** `/validation/class-validator` - Decorator-based validation

Each includes examples of:
- Body validation
- Query parameter validation
- Path parameter validation
- Nested object validation
- Custom error messages
- Complex validation rules

### 🎯 Decorator-Based Controllers

**Route:** `/decorators`

Demonstrates all available decorators:
- Route decorators: `@Get`, `@Post`, `@Put`, `@Delete`, `@Patch`
- Parameter decorators: `@Body`, `@Query`, `@Param`, `@Ctx`
- Context access for headers and custom responses

### 💉 Dependency Injection

**Route:** `/di`

Shows how to use DI in Shokupan:
- Injectable services
- Constructor injection
- Service dependencies
- Shared state across routes

### 🪝 Event Lifecycle Hooks

**Routes:** `/hooks`, `/hooks/per-route`

Demonstrates all hook types:
- `onError` - Error handling
- `onRequestStart` / `onRequestEnd` - Request lifecycle
- `onResponseStart` / `onResponseEnd` - Response lifecycle
- `beforeValidate` / `afterValidate` - Validation hooks
- `onRequestTimeout` / `onReadTimeout` / `onWriteTimeout` - Timeout handlers
- App-level vs Router-level hooks

### 🎨 JSX Rendering

**Route:** `/jsx`

Examples of JSX-based HTML rendering:
- Layout components
- Dynamic content with parameters
- Reusable components
- Form handling
- Multiple pages

### 📦 Middleware Plugins

All middleware plugins are enabled in the example:

- **CORS** - Cross-origin request handling
- **Compression** - Gzip/Brotli response compression
- **Rate Limiting** - Request throttling (100 req/min)
- **Security Headers** - XSS, CSRF protection
- **Session Management** - User sessions with cookies

### 📖 OpenAPI Documentation

**Route:** `/scalar`

- Interactive API documentation
- Automatic schema generation
- Static code analysis
- Runtime type detection
- All routes automatically documented

### 📁 Static File Serving

Multiple static file mount points:
- `/assets` - General static files
- `/images` - Image files
- `/files` - Downloadable files

All with directory listing enabled.

### ⏱️ Timeout Configuration

- Request timeout: 30 seconds
- Read timeout: 10 seconds
- Write timeout: Configured (if supported)

### 🔄 Existing Examples

- `/api/user` - User controller with decorators
- `/api/service_fetch` - External service integration
- `/` - API root with feature overview
- `/health` - Health check endpoint

## File Structure

```
src/example/
├── main.ts                          # Main application with all features
├── README.md                        # This file
├── .env.example                     # Environment variable template
│
├── validation-zod.ts                # Zod validation examples
├── validation-typebox.ts            # TypeBox validation examples
├── validation-ajv.ts                # Ajv validation examples
├── validation-valibot.ts            # Valibot validation examples
├── validation-class-validator.ts    # class-validator examples
│
├── decorator-controller.ts          # Decorator examples (17 routes)
├── di-example.ts                    # Dependency injection examples
├── hooks-example.ts                 # Event hooks examples
├── jsx-example.ts                   # JSX rendering examples
│
├── controller.ts                    # Original user controller
├── service_fetch.ts                 # Service fetch router
├── auth.ts                          # Authentication helpers
├── demo-runtime-analysis.ts         # Runtime OpenAPI analysis demo
│
└── static/                          # Static files directory
```

## Testing the Examples

### 1. Validation Examples

Try sending requests to validation endpoints:

```bash
# Zod example
curl -X POST http://localhost:3001/validation/zod/create-user \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com","age":25}'

# Invalid request (will fail validation)
curl -X POST http://localhost:3001/validation/typebox/create-user \
  -H "Content-Type: application/json" \
  -d '{"name":"Jo","email":"invalid","age":15}'
```

### 2. Decorator Examples

```bash
# GET with path parameter
curl http://localhost:3001/decorators/123

# POST with body
curl -X POST http://localhost:3001/decorators/create \
  -H "Content-Type: application/json" \
  -d '{"username":"johndoe","email":"john@example.com"}'
```

### 3. JSX Pages

Visit these URLs in your browser:
- http://localhost:3001/jsx - JSX home page
- http://localhost:3001/jsx/about - About page
- http://localhost:3001/jsx/user/123 - User profile
- http://localhost:3001/jsx/dashboard - Dashboard

### 4. Hooks

```bash
# Normal request (check console for hook logs)
curl http://localhost:3001/hooks/normal

# Error handling
curl http://localhost:3001/hooks/error

# Slow request (test timeouts)
curl "http://localhost:3001/hooks/slow?delay=2000"
```

## OpenTelemetry Tracing (Optional)

Shokupan supports OpenTelemetry for distributed tracing. To visualize traces:

### 1. Start the Aspire Dashboard

Run the following Docker command to start the .NET Aspire Dashboard:

```bash
docker run --rm -it \
  -p 18888:18888 \
  -p 4317:18889 \
  -p 4318:18890 \
  -e ASPIRE_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS=true \
  mcr.microsoft.com/dotnet/aspire-dashboard:latest
```

### 2. Configure OpenTelemetry

Create a `.env` file in the `src/example` directory (use `.env.example` as a template):

```bash
cp .env.example .env
```

Configure the OpenTelemetry endpoint in your application to point to `http://localhost:4318`.

### 3. View Traces

Once the dashboard is running, visit:

- **http://localhost:18888** - Aspire Dashboard (traces, metrics, logs)

The dashboard provides real-time visibility into your application's performance, including:

- HTTP request traces
- Database queries
- External API calls
- Custom spans and events

## Environment Variables

The example application supports the following environment variables:

- `GITHUB_CLIENT_ID` - GitHub OAuth client ID (for authentication examples)
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret (for authentication examples)
- `SESSION_SECRET` - Secret key for session encryption
- `OTEL_EXPORTER_OTLP_ENDPOINT` - OpenTelemetry endpoint (optional)

## Development Tips

- **Hot Reload**: The dev server watches for file changes and automatically restarts
- **Inspect Mode**: The dev server runs with `--inspect` for debugging
- **Console Output**: Check the console for hook logs and middleware activity
- **Custom Port**: Modify the `port` option in the Shokupan constructor to change the server port

## Learning More

Check out the [Shokupan documentation](https://github.com/knackstedt/shokupan) for more information on:

- Creating custom plugins
- Advanced routing patterns
- OpenAPI customization
- Authentication strategies
- Performance optimization
- Production deployment

## Feature Matrix

| Feature | Example Location | Status |
|---------|-----------------|--------|
| Zod Validation | `/validation/zod` | ✅ |
| TypeBox Validation | `/validation/typebox` | ✅ |
| Ajv Validation | `/validation/ajv` | ✅ |
| Valibot Validation | `/validation/valibot` | ✅ |
| class-validator | `/validation/class-validator` | ✅ |
| Decorators | `/decorators` | ✅ |
| Dependency Injection | `/di` | ✅ |
| Event Hooks | `/hooks` | ✅ |
| JSX Rendering | `/jsx` | ✅ |
| CORS Middleware | All routes | ✅ |
| Compression | All routes | ✅ |
| Rate Limiting | All routes | ✅ |
| Security Headers | All routes | ✅ |
| Session Management | All routes | ✅ |
| OpenAPI Docs | `/scalar` | ✅ |
| Static Files | `/assets`, `/images`, `/files` | ✅ |
| Timeout Config | App-level | ✅ |

---

**Happy coding with Shokupan! 🍞**

This example application is a complete reference for building production-ready applications with Shokupan.