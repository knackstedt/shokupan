import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import { getProcess } from './env';

export type ASTAnalyzerState = 'idle' | 'analyzing' | 'completed' | 'failed';

export interface ASTAnalyzerResult {
    applications: any[];
}

export interface ASTAnalyzerEvents {
    'started': () => void;
    'completed': (result: ASTAnalyzerResult) => void;
    'failed': (error: Error) => void;
    'progress': (message: string) => void;
}

/**
 * Worker-based AST analyzer that runs TypeScript analysis in a separate thread.
 * This prevents blocking the main event loop during intensive AST parsing.
 */
export class ASTAnalyzerWorker extends EventEmitter {
    private state: ASTAnalyzerState = 'idle';
    private result: ASTAnalyzerResult | null = null;
    private error: Error | null = null;
    private worker: Worker | null = null;
    private analysisPromise: Promise<ASTAnalyzerResult> | null = null;
    private rootDir: string;
    private entrypoint?: string;
    private timeout: number;
    private startTime: number = 0;

    constructor(rootDir: string, entrypoint?: string, timeout: number = 30000) {
        super();
        this.rootDir = rootDir;
        this.entrypoint = entrypoint;
        this.timeout = timeout;
    }

    /**
     * Get the current state of the analyzer.
     */
    public getState(): ASTAnalyzerState {
        return this.state;
    }

    /**
     * Get the cached result if analysis completed successfully.
     */
    public getResult(): ASTAnalyzerResult | null {
        return this.result;
    }

    /**
     * Get the error if analysis failed.
     */
    public getError(): Error | null {
        return this.error;
    }

    /**
     * Force re-analysis by clearing cached results.
     */
    public invalidateCache(): void {
        this.state = 'idle';
        this.result = null;
        this.error = null;
        this.analysisPromise = null;
    }

    /**
     * Check if analysis is currently running.
     */
    public isAnalyzing(): boolean {
        return this.state === 'analyzing';
    }

    /**
     * Check if analysis has completed successfully.
     */
    public isCompleted(): boolean {
        return this.state === 'completed';
    }

    /**
     * Check if analysis has failed.
     */
    public isFailed(): boolean {
        return this.state === 'failed';
    }

    /**
     * Get analysis duration in milliseconds (if completed or failed).
     */
    public getDuration(): number | null {
        if (this.state === 'idle' || this.state === 'analyzing') {
            return null;
        }
        return Date.now() - this.startTime;
    }

    private async runInlineAnalysis(): Promise<ASTAnalyzerResult> {
        this.state = 'analyzing';
        this.startTime = Date.now();
        this.emit('started');
        this.emit('progress', 'Starting AST analysis...');

        return new Promise<ASTAnalyzerResult>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.state = 'failed';
                this.error = new Error(`AST analysis timed out after ${this.timeout}ms`);
                this.emit('failed', this.error);
                reject(this.error);
            }, this.timeout);

            (async () => {
                try {
                    this.emit('progress', 'Initializing TypeScript compiler...');
                    const { OpenAPIAnalyzer } = await import('../plugins/application/openapi/analyzer');
                    this.emit('progress', 'Analyzing source files...');
                    const analyzer = new OpenAPIAnalyzer(this.rootDir, undefined, this.entrypoint);
                    const result = await analyzer.analyze();

                    clearTimeout(timeoutId);

                    if (this.state === 'analyzing') {
                        this.emit('progress', 'Analysis complete!');
                        this.state = 'completed';
                        this.result = result;
                        this.emit('completed', result);
                        resolve(result);
                    }
                } catch (error: any) {
                    clearTimeout(timeoutId);
                    if (this.state === 'analyzing') {
                        this.state = 'failed';
                        this.error = error;
                        this.emit('failed', error);
                        reject(error);
                    }
                }
            })();
        });
    }

    /**
     * Start AST analysis in a worker thread.
     * Returns immediately and emits events as analysis progresses.
     */
    public async analyze(): Promise<ASTAnalyzerResult> {
        // If already analyzing, return the existing promise
        if (this.analysisPromise) {
            return this.analysisPromise;
        }

        // If already completed, return cached result
        if (this.state === 'completed' && this.result) {
            return Promise.resolve(this.result);
        }

        // If previously failed, reset state for retry
        if (this.state === 'failed') {
            this.state = 'idle';
            this.error = null;
        }

        // Bun's worker_threads has stability issues that can cause segfaults.
        // Run analysis inline when in Bun to avoid memory leaks and crashes.
        if (typeof Bun !== 'undefined') {
            this.analysisPromise = this.runInlineAnalysis().finally(() => {
                this.analysisPromise = null;
            });
            return this.analysisPromise;
        }

        this.analysisPromise = new Promise<ASTAnalyzerResult>((resolve, reject) => {
            this.state = 'analyzing';
            this.startTime = Date.now();
            this.emit('started');

            // Create worker thread
            const workerPath = new URL('./ast-worker-thread.js', import.meta.url).pathname;

            this.worker = new Worker(workerPath, {
                workerData: {
                    rootDir: this.rootDir,
                    entrypoint: this.entrypoint
                }
            });

            // Set timeout
            const timeoutId = setTimeout(() => {
                if (this.worker) {
                    this.worker.terminate();
                    this.worker = null;
                }
                const timeoutError = new Error(`AST analysis timed out after ${this.timeout}ms`);
                this.state = 'failed';
                this.error = timeoutError;
                this.emit('failed', timeoutError);
                reject(timeoutError);
            }, this.timeout);

            // Handle worker messages
            this.worker.on('message', (message: any) => {
                if (message.type === 'progress') {
                    this.emit('progress', message.message);
                } else if (message.type === 'result') {
                    clearTimeout(timeoutId);
                    this.state = 'completed';
                    this.result = message.data;
                    this.emit('completed', this.result!);
                    resolve(this.result!);

                    // Clean up worker
                    if (this.worker) {
                        this.worker.terminate();
                        this.worker = null;
                    }
                }
            });

            // Handle worker errors
            this.worker.on('error', (err: Error) => {
                clearTimeout(timeoutId);
                this.state = 'failed';
                this.error = err;
                this.emit('failed', err);
                reject(err);

                // Clean up worker
                if (this.worker) {
                    this.worker.terminate();
                    this.worker = null;
                }
            });

            // Handle worker exit
            this.worker.on('exit', (code) => {
                clearTimeout(timeoutId);
                this.worker = null;
                if (code !== 0 && this.state === 'analyzing') {
                    const exitError = new Error(`Worker exited with code ${code}`);
                    this.state = 'failed';
                    this.error = exitError;
                    this.emit('failed', exitError);
                    reject(exitError);
                }
            });
        }).finally(() => {
            this.analysisPromise = null;
        });

        return this.analysisPromise;
    }

    /**
     * Wait for analysis to complete (if it's running) or return immediately if already done.
     */
    public async waitForCompletion(): Promise<ASTAnalyzerResult> {
        if (this.state === 'completed' && this.result) {
            return this.result;
        }

        if (this.state === 'failed' && this.error) {
            throw this.error;
        }

        if (this.state === 'analyzing' && this.analysisPromise) {
            return this.analysisPromise;
        }

        // Not started yet, start it
        return this.analyze();
    }

    /**
     * Terminate the worker thread if running.
     */
    public async terminate(): Promise<void> {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
        if (this.state === 'analyzing') {
            this.state = 'idle';
        }
    }
}

// Singleton instance for shared use across plugins
let globalAnalyzer: ASTAnalyzerWorker | null = null;

/**
 * Get or create the global AST analyzer instance.
 * This ensures all plugins share the same analysis results.
 */
export function getGlobalAnalyzer(rootDir?: string, entrypoint?: string, timeout?: number): ASTAnalyzerWorker {
    if (!globalAnalyzer) {
        globalAnalyzer = new ASTAnalyzerWorker(
            rootDir || getProcess()?.cwd() || '.',
            entrypoint,
            timeout
        );
    }
    return globalAnalyzer;
}

/**
 * Reset the global analyzer instance (useful for testing).
 */
export async function resetGlobalAnalyzer(): Promise<void> {
    if (globalAnalyzer) {
        await globalAnalyzer.terminate();
        globalAnalyzer = null;
    }
}
