import { Compression, SecurityHeaders, Shokupan } from '../src/index';

/**
 * Sample 5: Metrics / Monitoring API
 * Tests: SSE streaming, large JSON responses, performance headers
 */

const app = new Shokupan({
    port: 3105,
    development: true,
    enableOpenApiGen: true
});

app.use(Compression({ threshold: 64 }));
app.use(SecurityHeaders());

// Simulated metrics data
interface Metric {
    timestamp: string;
    cpu: number;
    memory: number;
    requests: number;
}

const metrics: Metric[] = [];
let requestCount = 0;

// Health
app.get('/health', () => ({ status: 'ok', service: 'metrics-api' }));

// Request counter middleware
app.use(async (ctx, next) => {
    requestCount++;
    await next();
});

// Current stats
app.get('/stats', () => ({
    uptime: process.uptime(),
    requests: requestCount,
    timestamp: new Date().toISOString()
}));

// Large dataset test
app.get('/metrics', () => {
    const data: Metric[] = [];
    for (let i = 0; i < 1000; i++) {
        data.push({
            timestamp: new Date(Date.now() - i * 60000).toISOString(),
            cpu: Math.random() * 100,
            memory: Math.random() * 16,
            requests: Math.floor(Math.random() * 10000)
        });
    }
    return { metrics: data, count: data.length };
});

// SSE stream of live metrics
app.get('/live', (ctx) => {
    return ctx.streamSSE(async (stream) => {
        for (let i = 0; i < 5; i++) {
            await stream.writeSSE({
                id: String(i),
                data: JSON.stringify({
                    timestamp: new Date().toISOString(),
                    cpu: Math.random() * 100,
                    memory: Math.random() * 16
                })
            });
            await stream.sleep(100);
        }
    });
});

// Aggregations
app.get('/aggregates', () => {
    return {
        avgCpu: Math.random() * 50 + 25,
        peakMemory: Math.random() * 10 + 6,
        totalRequests: requestCount
    };
});

await app.listen();
console.log('Metrics API running on https://localhost:3105');
