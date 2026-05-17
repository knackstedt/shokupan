
// Re-export types used in public API
export type { ApplicationInstance, RouteInfo } from './analyzer.impl';
import type { Logger } from '../../../util/logger';
import type { ApplicationInstance } from './analyzer.impl';

/**
 * OpenAPI Analyzer Wrapper.
 * 
 * This class wraps the actual OpenAPIAnalyzer implementation to facilitate
 * lazy loading of the 'typescript' peer dependency. The actual implementation
 * and the 'typescript' module are only loaded when `analyze()` is called.
 */
export class OpenAPIAnalyzer {
    private analyzerImpl: any;

    constructor(private rootDir: string, private logger?: Logger, private entrypoint?: string) { }

    /**
     * Main analysis entry point.
     * Dynamically imports the implementation and runs the analysis.
     */
    public async analyze(): Promise<{ applications: ApplicationInstance[]; }> {
        // Dynamic import to avoid loading 'typescript' peer dependency if not needed (e.g. at runtime)
        const { OpenAPIAnalyzer: AnalyzerImpl } = await import('./analyzer.impl');
        this.analyzerImpl = new AnalyzerImpl(this.rootDir, this.logger, this.entrypoint);
        return this.analyzerImpl.analyze();
    }

    /**
     * Generate OpenAPI specification.
     * Must be called after analyze().
     */
    public generateOpenAPISpec(): any {
        if (!this.analyzerImpl) {
            throw new Error('Must call analyze() before generateOpenAPISpec()');
        }
        return this.analyzerImpl.generateOpenAPISpec();
    }
}

/**
 * Analyze a directory and generate OpenAPI spec
 */
export async function analyzeDirectory(directory: string): Promise<any> {
    const analyzer = new OpenAPIAnalyzer(directory, undefined, undefined);
    return await analyzer.analyze();
}
