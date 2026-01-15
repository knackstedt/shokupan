import { spawn } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const CLI_PATH = path.resolve(__dirname, '../cli/index.ts');
// Using example project as fixture
const FIXTURE_DIR = path.resolve(__dirname, '../../examples/api_paths');
const OUTPUT_DIR = path.resolve(__dirname, './cli_output_test');

describe('CLI Generate Command', () => {

    beforeAll(() => {
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }
    });

    afterAll(() => {
        // Clean up output files
        if (fs.existsSync(OUTPUT_DIR)) {
            fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
        }
    });

    it('should generate all specs with default options', async () => {
        const proc = spawn({
            cmd: ['bun', CLI_PATH, 'generate', '--dir', FIXTURE_DIR],
            cwd: OUTPUT_DIR,
            stdout: 'pipe',
            stderr: 'pipe',
        });

        const exitCode = await proc.exited;
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();

        if (exitCode !== 0) {
            console.error('CLI Output:', stdout);
            console.error('CLI Error:', stderr);
        }

        expect(exitCode).toBe(0);
        expect(stdout).toContain('OpenAPI spec written to');
        expect(stdout).toContain('HTTP API spec written to');
        expect(stdout).toContain('AsyncAPI spec written to');

        // Check Files
        expect(fs.existsSync(path.join(OUTPUT_DIR, 'openapi.json'))).toBe(true);
        expect(fs.existsSync(path.join(OUTPUT_DIR, 'http-api.json'))).toBe(true);
        expect(fs.existsSync(path.join(OUTPUT_DIR, 'asyncapi.json'))).toBe(true);

        // Verify Content
        const openApi = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'openapi.json'), 'utf-8'));
        const httpApi = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'http-api.json'), 'utf-8'));
        const asyncApi = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'asyncapi.json'), 'utf-8'));

        // Compliant OpenAPI should not have x-tagGroups or x-middleware-registry
        expect(openApi['x-tagGroups']).toBeUndefined();
        expect(openApi['x-middleware-registry']).toBeUndefined();

        // Check a path for x-source-info
        if (openApi.paths && Object.keys(openApi.paths).length > 0) {
            const firstPath = Object.values(openApi.paths)[0] as any;
            const firstMethod = Object.values(firstPath)[0] as any;
            expect(firstMethod['x-source-info']).toBeUndefined();
        }

        // HTTP API should have extensions
        // Note: AST analysis puts x- extensions? analyzer.impl.ts doesn't explicitly add x-middleware-registry to the spec object return,
        // BUT our CLI logic manually adds x-middleware-registry!
        expect(httpApi['x-middleware-registry']).toBeDefined(); // We added this logic in CLI

        // AsyncAPI should have channels
        expect(asyncApi.asyncapi).toBe("3.0.0");
        expect(Object.keys(asyncApi.channels).length).toBeGreaterThan(0);

        // Check for specific event from example
        // app.event("trivial", ...) -> channel "trivial"
        expect(asyncApi.channels['trivial']).toBeDefined();
    }, 20000); // 20s output

    it('should show warnings for dynamic paths', async () => {
        // The example project "api_paths" main.ts has:
        // app.event("warning", (ctx) => { ctx.emit(process.env['FOO'] || 'bar'); });
        // ctx.emit(...) with variable is dynamic emit.

        // Also line 60: app.mount("/nested", NestedRouter);
        // And line 105: app.get("multipleResponsesAtOnce", ...)

        const proc = spawn({
            cmd: ['bun', CLI_PATH, 'generate', '--dir', FIXTURE_DIR, '--skip-openapi', '--skip-http-api', '--skip-asyncapi'],
            cwd: OUTPUT_DIR,
            stdout: 'pipe',
            stderr: 'pipe',
        });

        const stdout = await new Response(proc.stdout).text();

        // We expect warnings in stdout
        expect(stdout).toContain('warnings detected');
        expect(stdout).toContain('dynamic-emit');
        // expect(stdout).toContain('Dynamic emit detected');
    });

});
