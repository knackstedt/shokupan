import type { ApiReferenceConfiguration } from '@scalar/api-reference';
import type { OpenAPI } from '@scalar/openapi-types';
import { Eta } from 'eta';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ShokupanRouter } from '../../router';
import type { Shokupan } from '../../shokupan';
import { deepMerge } from '../../util/deep-merge';
import type { DeepPartial, ShokupanPlugin, ShokupanPluginOptions } from '../../util/types';
import { OpenAPIAnalyzer } from './openapi/analyzer';


const eta = new Eta();

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
    constructor(
        private readonly pluginOptions: ScalarPluginOptions = {}
    ) {
        pluginOptions.config ??= {};
        super();
        this.init();
    }

    onInit(app: Shokupan, options?: ShokupanPluginOptions) {
        const path = options?.path || this.pluginOptions.path || '/reference';
        app.mount(path, this);

        // Also run onMount logic if needed
        this.onMount(app);
    }

    private init() {
        const bootId = Date.now().toString();

        this.get("/_lifecycle", ctx => ctx.json({ boot: bootId }));

        this.get("/", ctx => {
            let path = ctx.url.toString();
            if (!path.endsWith("/")) path += "/";

            // Auto-reload script for development mode
            const devScript = ctx.app?.applicationConfig.development ? `
                <script>
                    (function() {
                        const bootId = "${bootId}";
                        let isDown = false;
                        
                        setInterval(async () => {
                            try {
                                const res = await fetch('${path}_lifecycle');
                                if (!res.ok) throw new Error('Down');
                                const data = await res.json();
                                if (data.boot !== bootId) {
                                    console.log('Server restarted, reloading...');
                                    window.location.reload();
                                }
                                else if (isDown) {
                                    isDown = false;
                                }
                            } catch (e) {
                                isDown = true;
                                console.log('Connection lost...');
                            }
                        }, 2000);
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

            return ctx.html(eta.renderString(`<!doctype html>
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
                        console.log(`[ScalarPlugin] Running eager static analysis on entrypoint: ${entrypoint}`);
                        const analyzer = new OpenAPIAnalyzer(process.cwd(), entrypoint);
                        let staticSpec = await analyzer.analyze();

                        if (!this.pluginOptions.baseDocument) this.pluginOptions.baseDocument = {};
                        deepMerge(this.pluginOptions.baseDocument as any, staticSpec);
                        console.log('[ScalarPlugin] Static analysis completed successfully.');
                    } catch (err) {
                        console.error('[ScalarPlugin] Failed to run static analysis:', err);
                    }
                }
            });
        }
    }
}