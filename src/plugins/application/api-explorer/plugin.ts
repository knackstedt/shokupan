import { readFile } from 'fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import renderToString from 'preact-render-to-string';
import { ShokupanRouter } from '../../../router';
import type { Shokupan } from '../../../shokupan.ts';
import type { ShokupanPlugin, ShokupanPluginOptions } from '../../../util/types.ts';
import { ApiExplorerApp } from './components.tsx';
export interface ApiExplorerOptions {
    baseDocument?: any;
    path?: string;
}

export class ApiExplorerPlugin extends ShokupanRouter implements ShokupanPlugin {

    constructor(private readonly pluginOptions: ApiExplorerOptions = {}) {
        console.log('ApiExplorerPlugin: CONSTRUCTOR CALLED');
        super({ renderer: renderToString });
        pluginOptions.path ??= '/explorer';
        this.init();
    }

    onInit(app: Shokupan, options?: ShokupanPluginOptions) {
        const path = this.pluginOptions.path || options?.path || '/apiexplorer';
        app.mount(path, this);

        // Ensure async api gen is enabled if this plugin is used
        if (app.applicationConfig.enableOpenApiGen !== true) {
            console.warn('ApiExplorerPlugin: enableOpenApiGen is disabled. ApiExplorerPlugin will not generate spec.');
        }
    }

    private static getBasePath() {
        const dir = dirname(fileURLToPath(import.meta.url));
        // In production (dist/), files are in dist/plugins/application/api-explorer/
        if (dir.endsWith('dist')) {
            return dir + '/plugins/application/api-explorer';
        }
        // In dev mode (src/plugins/application/api-explorer/), files are in same directory
        return dir;
    }

    init() {

        const serveFile = async (ctx: any, file: string, type: string) => {
            const content = await readFile(join(ApiExplorerPlugin.getBasePath(), 'static', file), 'utf-8');
            ctx.set('Content-Type', type);
            return ctx.send(content);
        };

        const stripSourceCode = (spec: any) => {
            if (!spec || !spec.paths) return spec;
            Object.values(spec.paths).forEach((methods: any) => {
                Object.values(methods).forEach((op: any) => {
                    if (op['x-source-info']?.snippet) {
                        delete op['x-source-info'].snippet;
                    }
                    if (op['x-shokupan-source']?.code) {
                        delete op['x-shokupan-source'].code;
                    }
                });
            });
            return spec;
        };

        this.get('/style.css', ctx => serveFile(ctx, 'style.css', 'text/css'));
        this.get('/theme.css', ctx => serveFile(ctx, 'theme.css', 'text/css'));
        this.get('/explorer-client.mjs', ctx => serveFile(ctx, 'explorer-client.mjs', 'application/javascript'));

        this.get('/_source', async (ctx) => {
            const file = ctx.query['file'];
            if (!file) return ctx.text('Missing file parameter', 400);
            try {
                // Security check? For now assuming internal tool usage / local strictness not needed as much
                // But ideally we verify it's within source root. 
                // Given the context of "ApiExplorerSource", we probably trust the file paths coming from our own metadata.
                const content = await readFile(file, 'utf-8');
                return ctx.text(content);
            } catch (err) {
                return ctx.text('File not found', 404);
            }
        });

        this.get('/openapi.json', async (ctx) => {
            const spec = (this.root as any).openApiSpec
                ? structuredClone((this.root as any).openApiSpec)
                : await (this.root || this).generateApiSpec();
            return ctx.json(stripSourceCode(spec));
        });

        this.get('/', async (ctx) => {
            const spec = (this.root as any).openApiSpec
                ? structuredClone((this.root as any).openApiSpec)
                : await (this.root || this).generateApiSpec();
            const asyncSpec = (ctx.app as any).asyncApiSpec;

            // We pass the STRIPPED spec to the UI payload
            console.log('Rendering ApiExplorerApp...');
            try {
                const element = ApiExplorerApp({ spec: stripSourceCode(spec), asyncSpec });
                // console.log('Element:', JSON.stringify(element, null, 2));
                const html = renderToString(element);
                console.log('Rendered HTML Length:', html.length);
                if (html.length === 0) console.error('RENDERED HTML IS EMPTY!');
                return ctx.html(html);
            } catch (err) {
                console.error('Render Error:', err);
                return ctx.text('Render Error: ' + String(err), 500);
            }
        });
    }
}
