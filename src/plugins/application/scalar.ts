import type { OpenAPI } from '@scalar/openapi-types';
import type { ApiReferenceConfiguration } from '@scalar/types/api-reference';
import type { Eta } from 'eta';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ShokupanRouter } from '../../router';
import type { Shokupan } from '../../shokupan';
import { deepMerge } from '../../util/deep-merge';
import { $isMounted } from '../../util/symbol';
import type { DeepPartial, ShokupanPlugin, ShokupanPluginOptions } from '../../util/types';
import { OpenAPIAnalyzer } from './openapi/analyzer';


export type ScalarPluginOptions = {
    /**
     * Base document to use for API reference.
     */
    baseDocument?: DeepPartial<OpenAPI.Document>;
    /**
     * Configuration for API reference.
     */
    config?: Partial<ApiReferenceConfiguration>;
    /**
     * Whether to enable static analysis.
     * When this is enabled, the plugin will run static analysis on the entrypoint
     * and generate an OpenAPI document. This is useful for when you want to generate
     * an OpenAPI document without having to manually define it.
     * 
     * Only works with TypeScript entrypoints.
     */
    enableStaticAnalysis?: boolean;

    /**
     * Path to mount the plugin to.
     * @default '/reference'
     */
    path?: string;
};

/**
 * Scalar plugin. This plugin provides an API reference interface for your API.
 * @param options Scalar plugin options
 * @returns Scalar plugin instance
 */
export class ScalarPlugin extends ShokupanRouter<any> implements ShokupanPlugin {
    private eta: Eta | undefined;

    constructor(
        private readonly pluginOptions: ScalarPluginOptions = {}
    ) {
        pluginOptions.config ??= {};
        super();

        // Metadata
        this.metadata = {
            file: import.meta.file,
            line: 1,
            name: 'ScalarPlugin',
            pluginName: 'Scalar'
        };

        // Initialize routes immediately so the plugin works when mounted directly
        this.initRoutes();
    }

    async onInit(app: Shokupan, options?: ShokupanPluginOptions) {
        // Eagerly load Eta during app initialization
        const { Eta } = await import('eta');
        this.eta = new Eta();

        if (!(this as any)[$isMounted]) {
            const path = options?.path || this.pluginOptions.path || '/reference';
            app.mount(path, this);
        }

        // Also run onMount logic if needed
        this.onMount(app);
    }

    private async ensureEta() {
        if (!this.eta) {
            const { Eta } = await import('eta');
            this.eta = new Eta();
        }
    }

    private initRoutes() {
        const bootId = Date.now().toString();

        this.get("/_lifecycle", (ctx) => {
            ctx.upgrade({
                data: { bootId },  // Still pass bootId in data
                open: (ctx, ws) => {
                    if (ws) {
                        ws.send(JSON.stringify({ type: 'hello', bootId }));
                    }
                }
            });
        });

        this.get("/", async (ctx) => {
            await this.ensureEta();

            let path = ctx.path;
            if (!path.endsWith("/")) path += "/";

            // Auto-reload script for development mode
            const devScript = ctx.app?.applicationConfig.development ? `
                <script>
                    (function() {
                        const bootId = "${bootId}";
                        let ws;
                        let reconnectTimer;
                        
                        function connect() {
                            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                            const wsUrl = protocol + '//' + window.location.host + '${path}_lifecycle';
                            
                            ws = new WebSocket(wsUrl);
                            
                            ws.onopen = () => {
                                console.log('[Scalar] Connected to lifecycle monitor');
                                if (reconnectTimer) {
                                    clearTimeout(reconnectTimer);
                                    reconnectTimer = undefined;
                                }
                            };
                            
                            ws.onmessage = (event) => {
                                try {
                                    const data = JSON.parse(event.data);
                                    if (data.type === 'hello') {
                                        if (data.bootId !== bootId) {
                                            console.log('[Scalar] Server restarted (timestamp change), reloading...');
                                            window.location.reload();
                                        }
                                    }
                                } catch (e) {}
                            };
                            
                            ws.onclose = () => {
                                console.log('[Scalar] Lifecycle connection lost');
                                ws = undefined;
                                scheduleReconnect();
                            };
                        }
                        
                        function scheduleReconnect() {
                            if (reconnectTimer) return;
                            reconnectTimer = setTimeout(() => {
                                reconnectTimer = undefined;
                                connect();
                            }, 2000);
                        }
                        
                        connect();
                    })();
                </script>
            ` : '';

            // Attempt to read theme.css from src or dist
            let themeCss = '';
            try {
                // Try src location
                try {
                    themeCss = readFileSync(join(process.cwd(), 'src/theme.css'), 'utf-8');
                } catch {
                    // Try adjacent to main/dist? For now, we rely on src
                }
            } catch (e) { }

            if (!this.eta) throw new Error("Eta not initialized");

            return ctx.html(this.eta.renderString(`<!doctype html>
                <html lang="en">
                <head>
                    <title>API Reference</title>
                    <meta charset = "utf-8" />
                    <meta name="viewport" content = "width=device-width, initial-scale=1" />
                    <style>
                        ${themeCss}
                        
                        :root {
                            --scalar-color-1: var(--primary);
                            --scalar-color-2: var(--secondary);
                            --scalar-color-3: var(--accent);
                            --scalar-color-accent: var(--accent);
                            
                            --scalar-background-1: var(--bg-primary);
                            --scalar-background-2: var(--bg-secondary);
                            --scalar-background-3: var(--bg-card);
                            
                            --scalar-text-1: var(--text-primary);
                            --scalar-text-2: var(--text-secondary);
                            --scalar-text-3: var(--text-muted);
                            
                            --scalar-border-color: var(--border-color);
                        }
                    </style>
                </head>

                <body>
                    <div id="app"></div>
                    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
                    <script>
                        Scalar.createApiReference('#app', [{ ...<%~ JSON.stringify(it.config.baseDocument) %>,
                            url: "<%= it.path %>openapi.json",
                        }
                    ])
                    </script>
                    <%~ it.devScript %>
                </body>

                </html>`, { path, config: this.pluginOptions, devScript }));
        });

        this.get("/openapi.json", async (ctx) => {
            let spec: any;
            // Use pre-generated spec if available (from startup)
            if ((this.root as any).openApiSpec) {
                try {
                    spec = structuredClone((this.root as any).openApiSpec);
                } catch (e) {
                    // Fallback if structuredClone fails (e.g. non-cloneable types)
                    spec = Object.assign({}, (this.root as any).openApiSpec);
                }
            }
            else {
                // Fallback to on-demand generation
                spec = await (this.root || this).generateApiSpec();
            }

            // If static analysis ran in onStart, baseDocument is already populated.
            // If NOT (e.g. strict mode or unit test without listen), we might need to lazy load?
            // For now, assume baseDocument has it.
            // But we still need to merge baseDocument (static) + spec (runtime).

            if (this.pluginOptions.baseDocument) {
                deepMerge(spec, this.pluginOptions.baseDocument);
            }

            return ctx.json(spec);
        });
    }

    // New lifecycle method to be called by router.mount
    public onMount(parent: ShokupanRouter<any>) {
        if ((parent as any).onStart) {
            (parent as any).onStart(async () => {
                if (this.pluginOptions.enableStaticAnalysis) {
                    try {
                        const entrypoint = process.argv[1];
                        (parent as any).logger?.info('ScalarPlugin', `Running eager static analysis on entrypoint: ${entrypoint}`);
                        const analyzer = new OpenAPIAnalyzer(process.cwd(), entrypoint, (parent as any).logger);
                        let staticSpec = await analyzer.analyze();

                        if (!this.pluginOptions.baseDocument) this.pluginOptions.baseDocument = {};
                        deepMerge(this.pluginOptions.baseDocument as any, staticSpec);
                        (parent as any).logger?.info('ScalarPlugin', 'Static analysis completed successfully.');
                    } catch (err) {
                        (parent as any).logger?.error('ScalarPlugin', 'Failed to run static analysis:', { error: err });
                    }
                }
            });
        }
    }
}