import type { ApiReferenceConfiguration } from '@scalar/api-reference';
import type { OpenAPI } from '@scalar/openapi-types';
import { Eta } from 'eta';
import { ShokupanRouter } from '../../router';
import type { Shokupan } from '../../shokupan';
import { deepMerge } from '../../util/deep-merge';
import type { DeepPartial, ShokupanPlugin, ShokupanPluginOptions } from '../../util/types';
import { OpenAPIAnalyzer } from './openapi/analyzer';

const eta = new Eta();

export type ScalarPluginOptions = {
    baseDocument?: DeepPartial<OpenAPI.Document>;
    config?: Partial<ApiReferenceConfiguration>;
    enableStaticAnalysis?: boolean;
};

export class ScalarPlugin extends ShokupanRouter<any> implements ShokupanPlugin {
    constructor(
        private readonly pluginOptions: ScalarPluginOptions = {}
    ) {
        pluginOptions.config ??= {};
        super();
        this.init();
    }

    onInit(app: Shokupan, options?: ShokupanPluginOptions) {
        if (options?.path) {
            app.mount(options.path, this);
        } else {
            app.mount(options.path ?? '/', this);
        }

        // Also run onMount logic if needed
        this.onMount(app);
    }

    private init() {
        this.get("/", ctx => {
            let path = ctx.url.toString();
            if (!path.endsWith("/")) path += "/";

            return ctx.html(eta.renderString(`<!doctype html>
                <html>
                <head>
                    <title>API Reference</title>
                    <meta charset = "utf-8" />
                    <meta name="viewport" content = "width=device-width, initial-scale=1" />
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
                </body>

                </html>`, { path, config: this.pluginOptions }));
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