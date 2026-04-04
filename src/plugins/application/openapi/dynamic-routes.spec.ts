import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { createLogger } from '../../../util/logger';
import { OpenAPIAnalyzer } from '../openapi/analyzer';

const __dirname = new URL('.', import.meta.url).pathname;
const logger = createLogger();

async function analyze(directory: string) {
    const analyzer = new OpenAPIAnalyzer(directory, logger);
    return await analyzer.analyze();
}

describe('Dynamic Route Detection', () => {
    const fixtureDir = path.join(__dirname, 'fixtures/dynamic-routes');

    test('should resolve statically determinable routes', async () => {
        const result = await analyze(fixtureDir);
        const app = result.applications.find(a => a.name === 'router') || result.applications[0];

        expect(app).toBeDefined();

        // Literal
        const literalRoute = app.routes.find(r => r.path === '/static-literal');
        expect(literalRoute).toBeDefined();

        // Expression
        const expressionRoute = app.routes.find(r => r.path === '/api/v1/complex');
        expect(expressionRoute).toBeDefined();

        // Template
        const templateRoute = app.routes.find(r => r.path === '/api/v1/template');
        expect(templateRoute).toBeDefined();
    });

    test('should mark dynamic routes as not determinable', async () => {
        const result = await analyze(fixtureDir);
        const app = result.applications.find(a => a.name === 'router') || result.applications[0];

        const staticPaths = ['/static-literal', '/api/v1/complex', '/api/v1/template'];
        const dynamicRoutes = app.routes.filter(r => !staticPaths.includes(r.path));

        const unresolvedHttp = dynamicRoutes.find(r => r.path === '__DYNAMIC_ROUTE__');
        expect(unresolvedHttp).toBeDefined();

        const unresolvedEvent = dynamicRoutes.find(r => r.path === '__DYNAMIC_EVENT__');
        expect(unresolvedEvent).toBeDefined();
    });
});
