import { readFile } from 'fs/promises';
import { join } from 'path';
import renderToString from 'preact-render-to-string';
import { ShokupanRouter } from '../../../router';
import { ApiExplorerApp } from './components.tsx';

export interface ApiExplorerOptions {
    baseDocument?: any;
    path?: string;
}

export class ApiExplorerPlugin extends ShokupanRouter {

    constructor(private readonly pluginOptions?: ApiExplorerOptions) {
        super({ renderer: renderToString });
        pluginOptions.path ??= '/explorer';

        const serveFile = async (ctx: any, file: string, type: string) => {
            const content = await readFile(join(__dirname, 'static', file), 'utf-8');
            ctx.set('Content-Type', type);
            return ctx.send(content);
        };

        this.get('/style.css', ctx => serveFile(ctx, 'style.css', 'text/css'));
        this.get('/theme.css', ctx => serveFile(ctx, 'theme.css', 'text/css'));
        this.get('/explorer-client.mjs', ctx => serveFile(ctx, 'explorer-client.mjs', 'application/javascript'));

        this.get('/openapi.json', async (ctx) => {
            const spec = (this.root as any).openApiSpec
                ? structuredClone((this.root as any).openApiSpec)
                : await (this.root || this).generateApiSpec();
            return ctx.json(spec);
        });

        this.get('/', async (ctx) => {
            const spec = (this.root as any).openApiSpec
                ? structuredClone((this.root as any).openApiSpec)
                : await (this.root || this).generateApiSpec();
            const asyncSpec = (ctx.app as any).asyncApiSpec;

            return ctx.jsx(ApiExplorerApp({ spec, asyncSpec }));
        });
    }
}
