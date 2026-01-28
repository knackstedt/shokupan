import { EventEmitter } from 'events';
import path from 'path';
import { Worker } from 'worker_threads';

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

        this.analysisPromise = new Promise<ASTAnalyzerResult>((resolve, reject) => {
            this.state = 'analyzing';
            this.startTime = Date.now();
            this.emit('started');

            // Create worker thread
            const workerPath = path.join(__dirname, 'ast-worker-thread.js');
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
            this.worker.on('error', (err) => {
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
                if (code !== 0 && this.state === 'analyzing') {
                    clearTimeout(timeoutId);
                    const exitError = new Error(`Worker exited with code ${code}`);
                    this.state = 'failed';
                    this.error = exitError;
                    this.emit('failed', exitError);
                    reject(exitError);
                }
            });
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
    public terminate(): void {
        if (this.worker) {
            this.worker.terminate();
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
            rootDir || process.cwd(),
            entrypoint,
            timeout
        );
    }
    return globalAnalyzer;
}

/**
 * Reset the global analyzer instance (useful for testing).
 */
export function resetGlobalAnalyzer(): void {
    if (globalAnalyzer) {
        globalAnalyzer.terminate();
        globalAnalyzer = null;
    }
}
