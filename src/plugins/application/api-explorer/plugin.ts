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
        super({ renderer: renderToString });
        pluginOptions.path ??= '/explorer';

        // Metadata
        this.metadata = {
            file: import.meta.file,
            line: 1,
            name: 'ApiExplorerPlugin',
            pluginName: 'ApiExplorer'
        };

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

            // Security: Validate path is within project root
            const { resolve, normalize, isAbsolute } = await import('node:path');
            const cwd = process.cwd();
            const resolvedPath = resolve(cwd, file);

            // Ensure the resolved path starts with the cwd
            // This prevents ../ traversal.
            // We DO NOT resolve symlinks (no fs.realpath), so we trust the logical path structure.
            if (!resolvedPath.startsWith(cwd)) {
                return ctx.text('Forbidden: File must be within project root', 403);
            }

            try {
                const content = await readFile(resolvedPath, 'utf-8');
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
            const base = this.pluginOptions.path!;
            const element = ApiExplorerApp({ spec: stripSourceCode(spec), base, asyncSpec });
            const html = renderToString(element);
            if (html.length === 0) throw new Error('ApiExplorerPlugin: rendered page is blank.');
            return ctx.html(html);
        });
    }
}
