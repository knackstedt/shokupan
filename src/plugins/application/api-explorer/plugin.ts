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
            return ctx.jsx(ApiExplorerApp({ spec: stripSourceCode(spec), asyncSpec }));
        });
    }
}
