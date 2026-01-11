
import { Eta } from 'eta';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShokupanRouter } from '../../../router';
import type { Shokupan } from '../../../shokupan';
import { deepMerge } from '../../../util/deep-merge';
import type { DeepPartial, ShokupanPlugin, ShokupanPluginOptions } from '../../../util/types';
import { generateAsyncApi } from './generator';

export interface AsyncApiPluginOptions {
    path?: string;
    spec?: DeepPartial<any>;
}

export class AsyncApiPlugin extends ShokupanRouter<any> implements ShokupanPlugin {

    private eta: Eta;

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
        super();
        this.init();
        const viewsPath = AsyncApiPlugin.getBasePath() + "/static";
        console.log('[AsyncApiPlugin] Views Path:', viewsPath);
        this.eta = new Eta({
            views: viewsPath,
            cache: false
        });
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
        this.get('/', async ctx => {
            const specPath = `${ctx.path.endsWith('/') ? ctx.path : ctx.path + '/'}json`;
            const template = await readFile(AsyncApiPlugin.getBasePath() + "/static/index.eta", 'utf8');

            const str = this.eta.renderString(template, {
                specPath,
                serverUrl: `${ctx.hostname}:${ctx.app?.applicationConfig.port}`
            });
            return ctx.html(str);
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
    }
}
