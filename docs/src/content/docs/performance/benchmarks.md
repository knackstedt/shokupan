---
title: Benchmarks
description: Performance benchmarks comparing Shokupan to other frameworks
---

Shokupan is built with performance as a top priority. This page contains comprehensive benchmark results comparing Shokupan against other popular Node.js web frameworks across both **Bun** and **Node.js** runtimes.

## Overview

Our benchmark suite tests frameworks under both basic and advanced scenarios to provide a realistic comparison of performance characteristics. All benchmarks use [autocannon](https://github.com/mcollina/autocannon) for load testing with **100 concurrent connections**.

## Frameworks Tested

- **Shokupan** - The framework being benchmarked
- **Fastify** - High-performance web framework
- **Express** - De-facto standard Node.js framework
- **Koa** - Modern, lightweight framework by Express creators
- **Hapi** - Enterprise-grade framework
- **NestJS** - TypeScript-first progressive framework
- **Hono** - Ultrafast web framework (advanced benchmarks)
- **Elysia** - End-to-end type-safe framework for Bun (advanced benchmarks)

## Basic Benchmark Suite

The basic benchmark suite tests fundamental request handling capabilities across three standardized endpoints:

### Test Endpoints

1. **`/static`** - Returns plain text "Hello World"
   - Tests raw throughput with minimal overhead
   - Pure routing and response generation performance

2. **`/json`** - Returns a medium-sized JSON object (~500 bytes)
   - Tests JSON serialization performance
   - Measures overhead of content-type headers

3. **`/dynamic/:id`** - Returns dynamic content with path parameter interpolation
   - Tests routing with path parameters
   - Measures parameter extraction overhead

### Metrics Collected

- **Requests/sec** (average) - Higher is better
- **Latency** (average, in milliseconds) - Lower is better
- **Throughput** (average, in MB/s) - Higher is better

### Interactive Results

<iframe src="/shokupan/report.html" style="width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 4px;"></iframe>

## Advanced Benchmark Suite

The advanced benchmark suite tests frameworks under more realistic and challenging scenarios that go beyond basic request handling.

### Advanced Scenarios

#### 1. **Compression Performance**
Tests compression across multiple algorithms:
- **gzip** - Standard compression
- **brotli** - Modern high-compression algorithm
- **deflate** - Legacy compression
- **zstd** - Facebook's high-performance compression
- **store** - No compression baseline

Measures throughput and latency with compressed responses. Note that not all frameworks support all compression algorithms.

#### 2. **Large Payloads**
Stress tests handling of large data:
- **Request**: POST with 10MB body
- **Response**: 5MB JSON response
- **Headers**: 100+ headers stress test

Tests memory efficiency and streaming capabilities.

#### 3. **Math Middleware Chain**
Tests middleware overhead with CPU-bound operations:
- Chain of 10 middleware functions
- Each performs MD5 hashing on request data
- Measures framework efficiency in chaining middleware
- Identifies middleware processing overhead

#### 4. **Route Scaling (1000 Handlers)**
Tests routing performance at scale:
- Registers 1000 unique routes
- Measures route lookup performance
- Identifies O(n) vs O(1) route lookup implementations
- Tests framework scalability

#### 5. **Property Access**
Tests context property access patterns:
- Multiple property reads per request
- Measures getter overhead
- Tests framework internals efficiency

#### 6. **Fully-Loaded Performance**
Measures overhead of production-ready configurations:
- OpenTelemetry tracing enabled
- Request validation active
- AsyncLocalStorage for request context
- Compares baseline vs fully-instrumented performance
- Simulates real-world production setups

#### 7. **Long-Pending Parallelization**
Tests concurrent connection handling:
- 1000+ concurrent requests with delays
- Tests connection handling capacity
- Measures timeout behavior
- Identifies framework parallelization capabilities

### Framework Limitations

Not all frameworks support all scenarios. Common limitations include:

- **Compression**: Some frameworks lack native brotli/zstd support
- **Math Middleware**: NestJS has limited dynamic middleware support
- **Long-Pending**: Some frameworks may not handle 1000+ connections efficiently

Failed scenarios are marked as "FAILED" in the report with error details.

### Interactive Results

<iframe src="/shokupan/advanced-report.html" style="width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 4px;"></iframe>

## Running Benchmarks Yourself

### Basic Benchmarks

```bash
cd src/benchmarking
bun install
bun run test
```

Filter by framework:
```bash
bun runner.ts --filter shokupan
```

### Advanced Benchmarks

```bash
cd src/benchmarking
bun run bench:advanced
```

Filter by framework:
```bash
bun advanced-runner.ts --filter shokupan
```

Filter by scenario:
```bash
bun advanced-runner.ts --scenario compression-gzip
```

Combine filters:
```bash
bun advanced-runner.ts --filter fastify --scenario large-payload-response
```

### Reports and History

Both benchmark suites automatically generate interactive HTML reports that:
- Sort frameworks by performance (Requests/Sec)
- Track the last 10 benchmark runs for historical comparison
- Automatically open in your default browser after completion
- Persist results in JSON format for programmatic access

## Performance Tips

For optimal Shokupan performance in production:

1. **Enable Compression** - Use `Compression()` plugin with zstd for large payloads
2. **Disable Logging** - Set `NODE_ENV=production` to disable development logs
3. **Use Bun Runtime** - Shokupan is optimized for Bun's performance characteristics
4. **Minimize Middleware** - Each middleware adds overhead; use only what you need
5. **Enable Caching** - Cache responses where appropriate using `ShokupanContext.set()` headers

See our [Production Best Practices](/shokupan/guides/production/) guide for more detailed recommendations.

## Contributing Benchmarks

To add new frameworks or scenarios to the benchmark suite, see the [benchmark README](https://github.com/knackstedt/shokupan/tree/main/src/benchmarking) for detailed instructions.
