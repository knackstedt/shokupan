import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { analyzeDirectory } from '../cli/openapi-analyzer';

describe('OpenAPI Analyzer', () => {
    test('should analyze example directory and generate OpenAPI spec', async () => {
        const exampleDir = path.join(__dirname, '../example');

        const spec = await analyzeDirectory(exampleDir);

        // Verify basic structure
        expect(spec).toBeDefined();
        expect(spec.openapi).toBe('3.1.0');
        expect(spec.info).toBeDefined();
        expect(spec.info.title).toBe('Shokupan API');
        expect(spec.paths).toBeDefined();

        // Verify paths were found
        const pathCount = Object.keys(spec.paths).length;
        expect(pathCount).toBeGreaterThan(0);

        console.log(`✓ Found ${pathCount} unique paths`);
    });

    test('should extract route methods correctly', async () => {
        const exampleDir = path.join(__dirname, '../example');

        const spec = await analyzeDirectory(exampleDir);

        // Check that at least one path has a GET method
        const hasGetMethod = Object.values(spec.paths).some((pathItem: any) =>
            pathItem.get !== undefined
        );

        expect(hasGetMethod).toBe(true);
    });

    test('should handle non-existent directory gracefully', async () => {
        const nonExistentDir = '/path/that/does/not/exist';

        // Should not throw, but return empty spec
        const spec = await analyzeDirectory(nonExistentDir);
        expect(spec).toBeDefined();
    });

    test('generated spec should be valid JSON', async () => {
        const exampleDir = path.join(__dirname, '../example');

        const spec = await analyzeDirectory(exampleDir);

        // Should be serializable to JSON
        const json = JSON.stringify(spec);
        expect(json).toBeDefined();

        // Should be parseable
        const parsed = JSON.parse(json);
        expect(parsed.openapi).toBe('3.1.0');
    });
});
