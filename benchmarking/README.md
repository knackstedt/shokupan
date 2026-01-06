# Shokupan Benchmark Suite

A comprehensive benchmarking suite comparing Shokupan's performance against other popular Node.js web frameworks across both Bun and Node.js runtimes.

## Frameworks Tested

- **Shokupan** - The framework being benchmarked
- **Fastify** - High-performance web framework
- **Express** - De-facto standard Node.js framework
- **Koa** - Modern, lightweight framework by Express creators
- **Hapi** - Enterprise-grade framework
- **NestJS** - TypeScript-first progressive framework

## Test Endpoints

Each framework implements three standardized endpoints:

1. **`/static`** - Returns plain text "Hello World"
2. **`/json`** - Returns a medium-sized JSON object (~500 bytes)
3. **`/dynamic/:id`** - Returns dynamic content with path parameter interpolation

## Benchmarking Method

The suite uses [autocannon](https://github.com/mcollina/autocannon) to perform load testing with the following configuration:

- **Connections**: 100 concurrent connections
- **Duration**: 5 seconds per endpoint
- **Runtimes**: Both Bun and Node.js

### Metrics Collected

- **Requests/sec** (average)
- **Latency** (average, in milliseconds)
- **Throughput** (average, in MB/s)

## Installation

Install all dependencies (including framework-specific packages):

```bash
bun install
```

### Dependencies Note

The benchmark suite requires several optional peer dependencies for NestJS microservices support, even though only HTTP benchmarks are performed. These include:

- `@nestjs/websockets`, `@nestjs/platform-socket.io` - WebSocket support
- `@grpc/grpc-js` - gRPC transport
- `nats`, `mqtt`, `ioredis`, `amqp-connection-manager` - Message queue transports

These are already included in `package.json` to prevent runtime errors during NestJS initialization.

## Running Benchmarks

Execute the full benchmark suite:

```bash
bun run test
```
or directly via the runner:
```bash
bun runner.ts
```

### Options

**Filter by Framework**

To run benchmarks for a specific framework only, use the `--filter` flag:

```bash
bun runner.ts --filter shokupan
```

This is useful for quick testing during development.

### Reports and History

The runner automatically generates an interactive HTML report at `report.html`.

- **Sorting**: Frameworks are sorted by performance (Best Requests/Sec) by default.
- **History**: The report includes tabs for the last 10 benchmark runs, allowing you to track performance changes over time. Results are persisted in `benchmark-results.json`.
- **Auto-Open**: The report will automatically open in your default browser after the benchmark completes.

## Project Structure

```
benchmark/
├── cases/              # Framework implementations
│   ├── shokupan.ts
│   ├── fastify.ts
│   ├── express.ts
│   ├── koa.ts
│   ├── hapi.ts
│   └── nest.ts
├── data.ts             # Shared test data (MEDIUM_JSON)
├── runner.ts           # Main benchmark orchestrator
├── worker.ts           # Worker process for running servers
├── dist/               # Compiled output for Node.js
├── report.html         # Generated benchmark results
└── README.md           # This file
```

## How It Works

1. **Compilation**: The runner first compiles all TypeScript cases to CommonJS for Node.js compatibility using Bun's bundler.

2. **Execution**: For each framework/runtime combination:
   - Spawns a worker process with the framework server
   - Waits 2 seconds for server startup
   - Runs autocannon against each endpoint
   - Collects performance metrics
   - Kills the worker process

3. **Reporting**: Results are aggregated into an HTML table showing performance across all dimensions.

## Adding New Frameworks

To add a new framework to the benchmark:

1. Create a new file in `cases/` (e.g., `cases/myframework.ts`)
2. Export an async `start(port: number)` function that:
   - Creates and starts the server on the given port
   - Implements the three standard endpoints
   - Returns a cleanup function
3. Add the framework name to the `FRAMEWORKS` array in `runner.ts`
4. Install any necessary dependencies

Example:

```typescript
import { MEDIUM_JSON } from "../data";

export async function start(port: number) {
    // Setup your framework
    const app = createApp();
    
    // Implement endpoints
    app.get("/static", () => "Hello World");
    app.get("/json", () => MEDIUM_JSON);
    app.get("/dynamic/:id", (params) => `Dynamic content for ${params.id}`);
    
    // Start server
    await app.listen(port);
    
    // Return cleanup function
    return async () => {
        await app.close();
    };
}
```

## Troubleshooting

### NestJS Dependency Errors

If you see errors like `Could not resolve: "nats"` or similar:

```bash
bun add @nestjs/websockets @nestjs/platform-socket.io @grpc/grpc-js nats mqtt ioredis amqp-connection-manager
```

These are optional peer dependencies that NestJS attempts to load during initialization.

### Port Already in Use

The runner uses random ports (3000-13000) to avoid conflicts. If you still encounter issues, make sure no other processes are binding to those ports.

### Server Startup Timeout

The default startup wait time is 2 seconds. If your framework takes longer to initialize, increase the timeout in `runner.ts`:

```typescript
// Wait for server to be ready
await new Promise(r => setTimeout(r, 2000)); // Increase this value
```

## Performance Tips

For fair comparisons:

- Close unnecessary applications
- Run on a consistent environment
- Disable logging in production frameworks
- Use the same payload size across frameworks
- Avoid I/O operations in route handlers

---

## Advanced Benchmark Suite

The advanced benchmark suite tests frameworks under more realistic and challenging scenarios beyond basic request handling.

### Running Advanced Benchmarks

Execute the full advanced benchmark suite:

```bash
bun run bench:advanced
```

### Advanced Scenarios

1. **Compression (gzip, brotli, deflate, zstd, store)**
   - Tests compression performance across different algorithms
   - Measures throughput and latency with compressed responses
   - Some frameworks may not support all algorithms

2. **Large Payloads**
   - **Request**: POST with 10MB body
   - **Response**: 5MB JSON response
   - **Headers**: 100+ headers stress test

3. **Math Middleware Chain**
   - 10 middleware performing MD5 hashing on request data
   - Tests middleware overhead and CPU-bound operations
   - Measures framework efficiency in chaining middleware

4. **Route Scaling (1000 Handlers)**
   - Registers 1000 unique routes
   - Tests routing performance at scale
   - Identifies O(n) vs O(1) route lookup implementations

5. **Fully-Loaded Performance**
   - Combines OpenTelemetry tracing, validators, and AsyncLocalStorage
   - Measures overhead of production-ready configurations
   - Compares baseline vs fully-instrumented performance

6. **Long-Pending Parallelization**
   - 1000+ concurrent requests with 5-minute delays
   - Tests connection handling and timeout behavior
   - Identifies frameworks' parallelization capabilities

### Filtering Options

**Filter by Framework:**
```bash
bun advanced-runner.ts --filter shokupan
```

**Filter by Scenario:**
```bash
bun advanced-runner.ts --scenario compression-gzip
```

**Combine Filters:**
```bash
bun advanced-runner.ts --filter fastify --scenario large-payload-response
```

### Advanced Reports

Results are saved to `advanced-results.json` and displayed in `advanced-report.html` with:
- Interactive tabs for each scenario
- Framework capability matrix (which scenarios are supported)
- Detailed metrics including percentiles
- Historical tracking (last 10 runs)

### Framework Limitations

Not all frameworks support all scenarios. Common limitations:

- **Compression**: Some frameworks lack brotli/zstd support
- **Math Middleware**: NestJS has limited dynamic middleware support
- **Long-Pending**: Some frameworks may not handle 1000+ connections efficiently

Failed scenarios are marked as "FAILED" in the report with error details.

### Project Structure

```
benchmark/
├── cases/                  # Basic framework implementations
├── advanced-cases/         # Advanced scenario implementations
│   ├── shokupan.ts
│   ├── fastify.ts
│   ├── express.ts
│   ├── koa.ts
│   ├── hapi.ts
│   ├── nest.ts
│   ├── hono.ts
│   └── elysia.ts
├── data.ts                 # Basic test data
├── advanced-data.ts        # Large payloads and utilities
├── runner.ts               # Basic benchmark runner
├── advanced-runner.ts      # Advanced benchmark runner
├── worker.ts               # Basic worker process
├── advanced-worker.ts      # Advanced worker process
├── report.html             # Basic benchmark report
└── advanced-report.html    # Advanced benchmark report
```

---

## License

Same as parent Shokupan project.
