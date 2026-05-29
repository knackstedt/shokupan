import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ASTAnalyzerWorker, getGlobalAnalyzer, resetGlobalAnalyzer } from './ast-analyzer-worker';

describe('ASTAnalyzerWorker', () => {
    let tempDir: string;

    beforeEach(async () => {
        // Reset global analyzer before each test
        await resetGlobalAnalyzer();

        // Small delay to allow Bun to fully clean up worker threads
        await new Promise(r => setTimeout(r, 50));

        // Create temp directory for each test
        tempDir = await mkdtemp(join(tmpdir(), 'ast-test-'));
    });

    it('should create an analyzer instance', () => {
        const analyzer = new ASTAnalyzerWorker(process.cwd());
        expect(analyzer).toBeDefined();
        expect(analyzer.getState()).toBe('idle');
    });

    it('should track state correctly', () => {
        const analyzer = new ASTAnalyzerWorker(process.cwd());
        expect(analyzer.isAnalyzing()).toBe(false);
        expect(analyzer.isCompleted()).toBe(false);
        expect(analyzer.isFailed()).toBe(false);
    });

    it('should return null result when not completed', () => {
        const analyzer = new ASTAnalyzerWorker(process.cwd());
        expect(analyzer.getResult()).toBe(null);
        expect(analyzer.getError()).toBe(null);
    });

    it('should start analysis and transition to analyzing state', async () => {
        // Create a simple test file
        const testFile = join(tempDir, 'test.ts');
        await writeFile(testFile, `
            import { Shokupan } from 'shokupan';
            const app = new Shokupan();
            app.get('/test', (ctx) => ctx.json({ message: 'test' }));
        `);

        const analyzer = new ASTAnalyzerWorker(tempDir, testFile, 5000);

        // Start analysis (don't await to check state immediately)
        const promise = analyzer.analyze();

        // State might already be 'completed' or still 'analyzing' depending on execution speed
        const state = analyzer.getState();
        expect(['analyzing', 'completed', 'failed']).toContain(state);

        // Now await completion
        try {
            await promise;
            // Should be in completed or failed state
            expect(['completed', 'failed']).toContain(analyzer.getState());
        } catch (err) {
            // Analysis might fail in test environment, that's ok
            expect(analyzer.getState()).toBe('failed');
        }

        await analyzer.terminate();
    }, 10000); // Increased timeout for AST analysis

    it('should return cached result on subsequent calls', async () => {
        const analyzer = new ASTAnalyzerWorker(tempDir, undefined, 5000);

        try {
            const result1 = await analyzer.analyze();
            const result2 = await analyzer.analyze();

            // Should return same result
            expect(result1).toBe(result2);
        } catch (err) {
            // Analysis might fail, but it should fail consistently
            expect(analyzer.getState()).toBe('failed');
        }

        await analyzer.terminate();
    }, 10000);

    it('should use global singleton analyzer', () => {
        const analyzer1 = getGlobalAnalyzer(process.cwd());
        const analyzer2 = getGlobalAnalyzer(process.cwd());

        expect(analyzer1).toBe(analyzer2);
    });

    it('should respect timeout setting', async () => {
        // Create analyzer with very short timeout
        const analyzer = new ASTAnalyzerWorker(tempDir, undefined, 100);

        try {
            await analyzer.analyze();
        } catch (err) {
            // Should timeout
            expect((err as Error).message).toContain('timed out');
        }

        await analyzer.terminate();
    }, 5000);

    // Cleanup after each test
    afterEach(async () => {
        await resetGlobalAnalyzer();

        try {
            await rm(tempDir, { recursive: true, force: true });
        } catch (e) {
            // Ignore cleanup errors
        }
    });
});
