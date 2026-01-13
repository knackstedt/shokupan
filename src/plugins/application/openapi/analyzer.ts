
// Re-export types used in public API
export type { ApplicationInstance, RouteInfo } from './analyzer.impl';
import type { ApplicationInstance } from './analyzer.impl';

/**
 * OpenAPI Analyzer Wrapper.
 * 
 * This class wraps the actual OpenAPIAnalyzer implementation to facilitate
 * lazy loading of the 'typescript' peer dependency. The actual implementation
 * and the 'typescript' module are only loaded when `analyze()` is called.
 */
export class OpenAPIAnalyzer {
    constructor(private rootDir: string, private entrypoint?: string) { }

    /**
     * Main analysis entry point.
     * Dynamically imports the implementation and runs the analysis.
     */
    public async analyze(): Promise<{ applications: ApplicationInstance[]; }> {
        // Dynamic import to avoid loading 'typescript' peer dependency if not needed (e.g. at runtime)
        const { OpenAPIAnalyzer: AnalyzerImpl } = await import('./analyzer.impl');
        const instance = new AnalyzerImpl(this.rootDir, this.entrypoint);
        return instance.analyze();
    }
}

/**
 * Analyze a directory and generate OpenAPI spec
 */
export async function analyzeDirectory(directory: string): Promise<any> {
    const analyzer = new OpenAPIAnalyzer(directory);
    return await analyzer.analyze();
}
