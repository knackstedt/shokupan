import { Shokupan } from '../src/shokupan';
import { Dashboard } from '../src/plugins/application/dashboard/plugin';
import { DebugPlugin } from '../src/plugins/application/debug/plugin';
import { WebAppPlugin } from '../src/plugins/application/web-app/plugin';

const app = new Shokupan({
    port: 3000,
    enableOpenApiGen: true,
    enableAsyncApiGen: true,
});

app.get('/hello', (ctx) => {
    return ctx.json({ message: 'Hello, World!' });
});

app.post('/echo', async (ctx) => {
    const body = await ctx.json();
    return ctx.json({ echo: body });
});

app.on('test-event', (ctx, data) => {
    console.log('Received test event:', data);
    ctx.emit('test-response', { received: data });
});

app.register(new Dashboard({ path: '/dashboard' }));

app.register(new DebugPlugin({
    path: '/debug',
    apiExplorer: {
        enabled: true,
        enableSourceView: true
    },
    asyncApi: {
        enabled: true,
        disableSourceView: false
    }
}));

app.register(new WebAppPlugin({ path: '/_app' }));

app.start();

console.log(`
Server running at http://localhost:3000

Available endpoints:
- Dashboard (Preact):     http://localhost:3000/dashboard
- Angular Client:         http://localhost:3000/_app
- API Explorer (unified): http://localhost:3000/debug/explorer
- AsyncAPI (unified):     http://localhost:3000/debug/asyncapi

The Angular client will automatically detect and use the unified debug endpoints.
`);
