import { Container } from '../../src/decorators';
import { Compression } from '../../src/plugins/middleware/compression';
import { RateLimitMiddleware } from '../../src/plugins/middleware/rate-limit';
import { SecurityHeaders } from '../../src/plugins/middleware/security-headers';
import { Shokupan } from '../../src/shokupan';
import { AdminController } from './controllers/admin-controller';
import { NotificationController } from './controllers/notification-controller';
import { ApiRouter } from './routers/api';
import { CacheService } from './services/cache';
import { DatabaseService } from './services/database';
import { NotificationService } from './services/notification';
import { createWebSocketRouter } from './websocket/events';

// Register services in DI container
Container.register(DatabaseService, new DatabaseService());
Container.register(CacheService, new CacheService());
Container.register(NotificationService, new NotificationService());

interface AppState {
    requestId: string;
    startTime: number;
}

const app = new Shokupan<AppState>({
    port: parseInt(process.env['PORT'] || '8765'),
    development: true,
    enableOpenApiGen: true,
    enableAsyncApiGen: true,
    enableWebSocketTracking: true,
    enableMiddlewareTracking: true,
    requestTimeout: 30000,
    readTimeout: 10000,
});

// Global middleware
app.use(Compression({ threshold: 1024 }));
app.use(SecurityHeaders({ contentSecurityPolicy: false }));
app.use(RateLimitMiddleware({
    windowMs: 60 * 1000,
    max: 1000,
    message: { error: 'Rate limit exceeded' },
    headers: true
}));

// Request timing middleware
app.use((ctx, next) => {
    ctx.state.startTime = Date.now();
    ctx.state.requestId = crypto.randomUUID();
    ctx.set('x-request-id', ctx.state.requestId);
    return next();
});

// Root endpoint
app.get('/', {
    summary: 'Stress Test API Root',
    description: 'Complex API server for hardening Shokupan',
    tags: ['Root']
}, (ctx) => {
    return ctx.json({
        name: 'Shokupan Stress Test API',
        version: '1.0.0',
        endpoints: {
            api: '/api/v1',
            admin: '/admin',
            websocket: '/ws',
            docs: '/scalar',
            asyncapi: '/asyncapi'
        },
        stats: {
            restEndpoints: 60,
            websocketEvents: 35
        }
    });
});

// Mount API routers
app.mount('/api/v1', new ApiRouter());
app.mount('/', new AdminController());
app.mount('/notifications', new NotificationController());

// Mount WebSocket router
app.mount('/ws', createWebSocketRouter());

// Health check
app.get('/health', {
    summary: 'Health Check',
    tags: ['Health']
}, (ctx) => {
    return ctx.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Error test endpoints
app.get('/error/404', (ctx) => ctx.json({ error: 'Not found' }, 404));
app.get('/error/500', () => { throw new Error('Simulated error'); });
app.get('/error/timeout', async (ctx) => {
    await new Promise(resolve => setTimeout(resolve, 5000));
    return ctx.json({ message: 'This should not be reached' });
});

// Echo endpoint
app.post('/echo', async (ctx) => {
    const body = await ctx.body();
    return ctx.json({ echo: body, timestamp: Date.now() });
});

// Dynamic route test
app.get('/dynamic/:a/:b/:c', (ctx) => {
    return ctx.json({ params: ctx.params, query: ctx.query });
});

// Hook examples
app.hook('onRequestStart', (ctx) => {
    ctx.state.startTime = Date.now();
});

app.hook('onRequestEnd', (ctx) => {
    const duration = Date.now() - (ctx.state.startTime || 0);
    console.log(`[Request] ${ctx.method} ${ctx.path} - ${duration}ms`);
});

app.hook('onError', (ctx, error) => {
    console.error(`[Error] ${ctx.method} ${ctx.path}:`, error.message);
});

app.listen().then(() => {
    console.log(`
========================================
Shokupan Stress Test Server
========================================
REST APIs: 60+
WebSocket Events: 35+
Docs: http://localhost:${app.applicationConfig.port}/scalar
AsyncAPI: http://localhost:${app.applicationConfig.port}/asyncapi
========================================
`);
});
