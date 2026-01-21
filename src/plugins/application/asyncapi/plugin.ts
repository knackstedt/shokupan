import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import renderToString from 'preact-render-to-string';
import { ShokupanRouter } from '../../../router';
import type { Shokupan } from '../../../shokupan';
import { deepMerge } from '../../../util/deep-merge';
import type { DeepPartial, ShokupanPlugin, ShokupanPluginOptions } from '../../../util/types';
import { AsyncApiApp, buildNavTree } from './components.tsx';
import { generateAsyncApi } from './generator';

export interface AsyncApiPluginOptions {
    path?: string;
    spec?: DeepPartial<any>;
    disableSourceView?: boolean;
}

export class AsyncApiPlugin extends ShokupanRouter<any> implements ShokupanPlugin {

    private static getBasePath() {
        const dir = dirname(fileURLToPath(import.meta.url));
        // In production (dist/), files are in dist/plugins/application/asyncapi/
        if (dir.endsWith('dist')) {
            return dir + '/plugins/application/asyncapi';
        }
        // In dev mode (src/plugins/application/asyncapi/), files are in same directory
        return dir;
    }

    constructor(private pluginOptions: AsyncApiPluginOptions = {}) {
        super({ renderer: renderToString });
        this.pluginOptions.path ??= '/asyncapi';

        // Metadata
        this.metadata = {
            file: import.meta.file,
            line: 1,
            name: 'AsyncApiPlugin',
            pluginName: 'AsyncAPI'
        };

        this.init();
    }

    onInit(app: Shokupan, options?: ShokupanPluginOptions) {
        const path = this.pluginOptions.path || options?.path || '/asyncapi';
        app.mount(path, this);

        // Ensure async api gen is enabled if this plugin is used
        if (app.applicationConfig.enableAsyncApiGen !== true) {
            console.warn('AsyncApiPlugin: enableAsyncApiGen is disabled. AsyncApiPlugin will not generate spec.');
        }
    }

    private init() {
        const serveFile = async (ctx: any, file: string, type: string) => {
            const content = await readFile(join(AsyncApiPlugin.getBasePath(), 'static', file), 'utf-8');
            ctx.set('Content-Type', type);
            return ctx.send(content);
        };

        this.get('/style.css', ctx => serveFile(ctx, 'style.css', 'text/css'));
        this.get('/theme.css', ctx => serveFile(ctx, 'theme.css', 'text/css'));
        this.get('/asyncapi-client.mjs', ctx => serveFile(ctx, 'asyncapi-client.mjs', 'application/javascript'));

        this.get('/', async ctx => {
            let spec = ctx.app?.asyncApiSpec;
            if (!spec) {
                spec = await generateAsyncApi(ctx.app!);
            }
            if (this.pluginOptions.spec) {
                deepMerge(spec, this.pluginOptions.spec);
            }

            const serverUrl = `${ctx.hostname}:${ctx.app?.applicationConfig.port}`;
            const base = this.pluginOptions.path!;

            const disableSourceView = this.pluginOptions.disableSourceView;

            // Build navigation tree from spec
            const navTree = buildNavTree(spec);

            return ctx.jsx(AsyncApiApp({ spec, serverUrl, base, disableSourceView, navTree }));
        });

        this.get('/json', async ctx => {
            let spec = ctx.app?.asyncApiSpec;
            if (!spec) {
                // Fallback generation
                spec = await generateAsyncApi(ctx.app!);
            }

            if (this.pluginOptions.spec) {
                deepMerge(spec, this.pluginOptions.spec);
            }
            return ctx.json(spec);
        });

        this.get('/_code', async ctx => {
            const file = ctx.query['file'];
            if (!file || typeof file !== 'string') {
                return ctx.text('Missing file parameter', 400);
            }

            // Security: Validate path is within project root
            const { resolve } = await import('node:path');
            const cwd = process.cwd();
            const resolvedPath = resolve(cwd, file);

            if (!resolvedPath.startsWith(cwd)) {
                return ctx.text('Forbidden: File must be within project root', 403);
            }

            try {
                const content = await readFile(resolvedPath, 'utf8');
                return ctx.text(content);
            } catch (e: any) {
                return ctx.text('File not found: ' + e.message, 404);
            }
        });
    }
}
