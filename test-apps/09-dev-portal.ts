import { Shokupan, ScalarPlugin, MCPServerPlugin } from '../src/index';

/**
 * Sample 9: Developer Portal
 * Tests: Scalar OpenAPI docs, MCP Server plugin, static analysis
 */

const app = new Shokupan({
    port: 3111,
    development: true,
    enableOpenApiGen: true
});

interface ApiKey {
    id: string;
    name: string;
    key: string;
    scopes: string[];
    createdAt: string;
}

const apiKeys: ApiKey[] = [
    { id: '1', name: 'Production Key', key: 'pk_prod_123', scopes: ['read', 'write'], createdAt: new Date().toISOString() },
    { id: '2', name: 'Test Key', key: 'pk_test_456', scopes: ['read'], createdAt: new Date().toISOString() }
];

// Health
app.get('/health', () => ({ status: 'ok', service: 'dev-portal' }));

// API Keys management
app.get('/api/keys', () => ({ data: apiKeys.map(k => ({ id: k.id, name: k.name, scopes: k.scopes, createdAt: k.createdAt })) }));

app.get('/api/keys/:id', (ctx) => {
    const key = apiKeys.find(k => k.id === ctx.params.id);
    if (!key) return ctx.json({ error: 'Key not found' }, 404);
    return { data: { id: key.id, name: key.name, scopes: key.scopes, createdAt: key.createdAt } };
});

app.post('/api/keys', async (ctx) => {
    const body = await ctx.body() as { name?: string; scopes?: string[] };
    if (!body.name) return ctx.json({ error: 'Name required' }, 400);
    const key: ApiKey = {
        id: String(apiKeys.length + 1),
        name: body.name,
        key: 'pk_' + Math.random().toString(36).slice(2, 10),
        scopes: body.scopes || ['read'],
        createdAt: new Date().toISOString()
    };
    apiKeys.push(key);
    return ctx.json({ data: { id: key.id, name: key.name, key: key.key, scopes: key.scopes } }, 201);
});

app.delete('/api/keys/:id', (ctx) => {
    const index = apiKeys.findIndex(k => k.id === ctx.params.id);
    if (index === -1) return ctx.json({ error: 'Key not found' }, 404);
    const deleted = apiKeys.splice(index, 1)[0];
    return { data: { id: deleted.id, name: deleted.name } };
});

// Documentation
app.get('/api/docs', () => ({
    endpoints: [
        { method: 'GET', path: '/api/keys', description: 'List all API keys' },
        { method: 'GET', path: '/api/keys/:id', description: 'Get a specific API key' },
        { method: 'POST', path: '/api/keys', description: 'Create a new API key' },
        { method: 'DELETE', path: '/api/keys/:id', description: 'Revoke an API key' }
    ]
}));

// Register Scalar plugin for OpenAPI docs
await app.register(new ScalarPlugin({
    path: '/docs',
    enableStaticAnalysis: true
}));

// Register MCP Server plugin
await app.register(new MCPServerPlugin({
    path: '/mcp',
    allowIntrospection: true,
    allowToolExecution: true
}));

await app.listen();
console.log('Dev Portal running on https://localhost:3111');
console.log('  OpenAPI Docs: https://localhost:3111/docs');
console.log('  MCP Server: https://localhost:3111/mcp');
