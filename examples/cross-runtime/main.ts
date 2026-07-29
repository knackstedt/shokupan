/**
 * Cross-runtime example for Shokupan.
 *
 * Works in:
 *   - Bun:    bun examples/cross-runtime/main.ts
 *   - Node:   npx tsx examples/cross-runtime/main.ts
 *   - Deno:   deno run --allow-net --allow-env examples/cross-runtime/main.ts
 *
 * This example avoids all Bun-specific APIs and uses only standard
 * Web APIs + Node.js built-in modules that are available cross-runtime.
 */

import { Cors } from '../../src/plugins/middleware/cors';
import { Shokupan } from '../../src/shokupan';

declare const Deno: any;

const port = parseInt(process.env['PORT'] || '3111');

const app = new Shokupan({
    port,
    development: true,
    enableOpenApiGen: true,
});

app.use(Cors({ origin: '*' }));

app.get('/', (ctx) => {
    return ctx.json({
        message: 'Hello from Shokupan!',
        runtime: typeof Bun !== 'undefined' ? 'bun' : typeof Deno !== 'undefined' ? 'deno' : 'node',
        timestamp: new Date().toISOString(),
    });
});

app.get('/health', (ctx) => {
    return ctx.json({ status: 'healthy', uptime: process.uptime() });
});

app.get('/echo/:message', (ctx) => {
    return ctx.json({ echo: ctx.params.message });
});

app.post('/echo', async (ctx) => {
    const body = await ctx.body();
    return ctx.json({ echo: body });
});

app.get('/stream', (ctx) => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            const items = ['Hello', ' ', 'World', '!', '\n'];
            for (const item of items) {
                controller.enqueue(encoder.encode(item));
            }
            controller.close();
        }
    });
    return new Response(stream, {
        headers: { 'Content-Type': 'text/plain' }
    });
});

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║          🍞 Shokupan Cross-Runtime Example 🍞                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

🌐 Starting server on port ${port}...
   Runtime: ${typeof Bun !== 'undefined' ? 'Bun' : typeof Deno !== 'undefined' ? 'Deno' : 'Node.js'}

Endpoints:
  GET  /              - Hello world with runtime info
  GET  /health        - Health check
  GET  /echo/:msg     - Echo a path parameter
  POST /echo          - Echo a JSON body
  GET  /stream        - Streaming response
`);

app.listen();
