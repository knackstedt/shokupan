import { join, resolve } from 'node:path';
import type { Shokupan } from '../../../shokupan';
import type { ShokupanPlugin } from '../../../util/types';
import { Proxy } from '../../middleware/proxy';

const $isMounted = Symbol('isMounted');

export interface WebAppPluginOptions {
    /** URL prefix to mount the Angular SPA under. Defaults to '/_app' */
    path?: string;
    /** Absolute path to the Angular dist/browser directory (production mode).
     *  If not provided, the plugin auto-detects from import.meta.dirname. */
    distDir?: string;
}

/**
 * WebAppPlugin
 *
 * Development mode (ANGULAR_DEV_PORT env set):
 *   Proxies all /_app/** requests to the Angular dev server running on
 *   that port. Enables live reload without rebuilding.
 *
 * Production mode:
 *   Serves the built Angular SPA from client/dist/browser/.
 *   All sub-paths not matching a static asset are rewritten to index.html
 *   for SPA client-side navigation support.
 *
 * Injects `window.SHOKUPAN_BASE` into the served index.html so the Angular
 * app knows the server's base URL at runtime.
 */
export class WebAppPlugin implements ShokupanPlugin {
    private mountPath: string;
    private distDir: string;
    private devPort: string | undefined;

    constructor(private opts: WebAppPluginOptions = {}) {
        this.mountPath = opts.path ?? '/_app';
        this.devPort = process.env['ANGULAR_DEV_PORT'];
        // Default to <repo-root>/client/dist/browser
        this.distDir = opts.distDir ??
            resolve(import.meta.dirname, '../../../../client/dist/browser');
    }

    async onInit(app: Shokupan, options?: WebAppPluginOptions) {
        if ((this as any)[$isMounted]) return;
        (this as any)[$isMounted] = true;

        if (options?.path) this.mountPath = options.path;

        if (this.devPort) {
            this.initDev(app);
        } else {
            this.initProd(app);
        }
    }

    /** Dev mode: proxy all requests to the Angular dev server */
    private initDev(app: Shokupan) {
        // Read port dynamically at init time, not constructor time, to ensure env is loaded
        const currentDevPort = process.env['ANGULAR_DEV_PORT'] || this.devPort || '4200';
        const target = `http://localhost:${currentDevPort}`;

        const mainProxy = Proxy({
            target,
            ws: true,
            changeOrigin: true,
            pathRewrite: (path) => path.replace(this.mountPath, '') || '/'
        });

        const rootProxy = Proxy({
            target,
            ws: true,
            changeOrigin: true
        });

        // Register a catch-all route under the mount path for the main app
        app.get(`${this.mountPath}/**`, async (ctx) => mainProxy(ctx, async () => { }));
        app.get(this.mountPath, async (ctx) => mainProxy(ctx, async () => { }));

        // Pass root websocket connections to the dev server since Vite uses `wss://domain/?token=...`
        app.get('/', async (ctx) => {
            if (ctx.req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
                ctx.logger?.debug('WebAppPlugin', 'Intercepted root WebSocket upgrade, proxying to dev server...');
                return rootProxy(ctx, async () => { });
            }
        });

        // Register catch-alls at the root for Vite's internal development absolute paths
        // Angular uses /ng-cli-ws for its dev server WebSockets.
        const vitePaths = ['/@vite', '/@fs', '/@id', '/@react-refresh', '/node_modules', '/ng-cli-ws'];
        for (const vp of vitePaths) {
            app.get(`${vp}/**`, async (ctx) => rootProxy(ctx, async () => { }));
            app.get(vp, async (ctx) => rootProxy(ctx, async () => { }));
        }
    }
    /** Production mode: serve static files, SPA fallback to index.html */
    private initProd(app: Shokupan) {
        app.get(`${this.mountPath}/**`, async (ctx) => {
            const sub = new URL(ctx.req.url).pathname.replace(this.mountPath, '') || '/';

            // Try to serve as a static file first
            let filePath = join(this.distDir, sub);
            let file = Bun.file(filePath);

            if (!(await file.exists()) || (await file.stat()).isDirectory()) {
                // SPA fallback: serve index.html
                filePath = join(this.distDir, 'index.html');
                file = Bun.file(filePath);
            }

            if (!(await file.exists())) {
                return ctx.text('Not found', 404);
            }

            const content = await file.arrayBuffer();
            let body: ArrayBuffer = content;

            // Inject SHOKUPAN_BASE into index.html
            if (filePath.endsWith('index.html')) {
                const html = new TextDecoder().decode(content);
                const injected = html.replace(
                    '<head>',
                    `<head><script>window.SHOKUPAN_BASE="${this.mountPath}";</script>`,
                );
                body = new TextEncoder().encode(injected).buffer;
            }

            const mimeType = file.type || 'application/octet-stream';
            return new Response(body, {
                headers: {
                    'Content-Type': mimeType,
                    'Cache-Control': filePath.includes('index.html') ? 'no-cache' : 'max-age=31536000',
                },
            });
        });
    }
}
