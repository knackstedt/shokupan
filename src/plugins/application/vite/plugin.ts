import { join } from 'node:path';
import type { InlineConfig, ViteDevServer } from 'vite';
import type { Shokupan } from '../../../shokupan';
import { NotFoundError } from '../../../util/http-error';
import type { ShokupanPlugin } from '../../../util/types';
import { Proxy } from '../../middleware/proxy';

const $isMounted = Symbol('isMounted');

export interface VitePluginOptions {
    /** URL prefix to mount the Vite app under. Defaults to '/' */
    path?: string;
    /** Absolute path to vite.config file. Auto-detected if not provided. */
    configFile?: string;
    /** Vite project root. Auto-detected if not provided. */
    root?: string;
    /** Whether to fallback unmatched routes to index.html (SPA mode). Defaults to true. */
    spaFallback?: boolean;
    /** Production build output directory. Auto-detected from vite.config if not provided. */
    outDir?: string;
}

/**
 * VitePlugin integrates a Vite frontend application with Shokupan.
 *
 * In development, it starts a Vite dev server internally and proxies
 * unmatched requests to it, enabling seamless fullstack development with
 * a single command.
 *
 * In production, it serves the built static files from Vite's output directory
 * with SPA fallback support.
 *
 * @example
 * ```ts
 * import { Shokupan, VitePlugin } from 'shokupan';
 *
 * const app = new Shokupan({ development: true });
 * app.register(new VitePlugin());
 * await app.listen(3000);
 * ```
 */
export class VitePlugin implements ShokupanPlugin {
    private viteServer?: ViteDevServer;
    private mountPath: string;
    private configFile?: string;
    private root?: string;
    private spaFallback: boolean;
    private outDir?: string;

    constructor(private opts: VitePluginOptions = {}) {
        this.mountPath = opts.path ?? '/';
        this.configFile = opts.configFile;
        this.root = opts.root;
        this.spaFallback = opts.spaFallback ?? true;
        this.outDir = opts.outDir;
    }

    async onInit(app: Shokupan, options?: { path?: string }) {
        if ((this as any)[$isMounted]) return;
        (this as any)[$isMounted] = true;

        if (options?.path) this.mountPath = options.path;

        const isDev = app.applicationConfig.development;

        // In production, if outDir is explicitly provided, we don't need to resolve vite config
        if (!isDev && this.outDir) {
            await this.initProd(app, { configFile: this.configFile || '', outDir: this.outDir });
            return;
        }

        const viteConfig = await this.resolveViteConfig();

        if (isDev) {
            await this.initDev(app, viteConfig);
        } else {
            await this.initProd(app, viteConfig);
        }
    }

    private async resolveViteConfig(): Promise<{ configFile: string; outDir: string } | null> {
        const fs = await import('node:fs');
        const path = await import('node:path');

        let configFile = this.configFile;
        if (!configFile) {
            const cwd = this.root || process.cwd();
            const candidates = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'];
            for (let i = 0; i < candidates.length; i++) {
                const candidate = path.join(cwd, candidates[i]);
                if (fs.existsSync(candidate)) {
                    configFile = candidate;
                    break;
                }
            }
        }

        if (!configFile || !fs.existsSync(configFile)) {
            return null;
        }

        try {
            const { loadConfigFromFile } = await import('vite');
            const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, configFile, this.root);

            if (!loaded) {
                return { configFile, outDir: path.resolve(process.cwd(), 'dist') };
            }

            const root = loaded.config.root || process.cwd();
            const outDir = loaded.config.build?.outDir || 'dist';
            return { configFile, outDir: path.resolve(root, outDir) };
        } catch (err: any) {
            // Vite may not be installed
            if (err.code === 'ERR_MODULE_NOT_FOUND' || err.message?.includes("Cannot find package 'vite'")) {
                return null;
            }
            throw err;
        }
    }

    private async initDev(app: Shokupan, viteConfig: { configFile: string; outDir: string } | null) {
        const { createServer } = await import('vite');

        const inlineConfig: InlineConfig = {
            configFile: viteConfig?.configFile || this.configFile,
            root: this.root,
            server: {
                port: 0,
                strictPort: false
            }
        };

        this.viteServer = await createServer(inlineConfig);
        await this.viteServer.listen();

        const resolvedPort = (this.viteServer as any).httpServer?.address?.()?.port
            || this.viteServer.config.server.port
            || 5173;
        const target = `http://localhost:${resolvedPort}`;

        app.logger?.info('VitePlugin', `Vite dev server running at ${target}`);

        const proxy = Proxy({ target, changeOrigin: true, ws: true });

        // Proxy unmatched routes to Vite for SPA fallback.
        // Use an explicit catch-all route instead of onStrictError so that
        // we intercept requests BEFORE the ErrorView middleware catches
        // NotFoundError and renders its own 404 page in development mode.
        if (this.spaFallback) {
            app.get(`${this.mountPath === '/' ? '' : this.mountPath}/**`, async (ctx) => {
                const accept = ctx.request.headers.get('accept') || '';
                const upgrade = ctx.request.headers.get('upgrade') || '';

                // Allow WebSocket upgrades to pass through to Vite
                if (upgrade.toLowerCase() === 'websocket') {
                    return proxy(ctx, async () => { });
                }

                // Parse accept header into individual media types (strip q-values)
                const mediaTypes = accept.split(',').map((s: string) => s.trim().split(';')[0].trim().toLowerCase());

                // Avoid proxying API requests to Vite - only skip if JSON/XML is explicitly
                // requested as the primary type. Allow mixed browsers (text/html + */*) through.
                const hasJson = mediaTypes[0] === 'application/json';
                const hasXml = mediaTypes[0] === 'application/xml' || mediaTypes[0] === 'text/xml';
                if (hasJson || hasXml) {
                    throw new NotFoundError();
                }

                return proxy(ctx, async () => { });
            });
        }

        // Also proxy explicit Vite internal paths that might be requested
        // before the SPA fallback catches them (e.g. direct browser requests)
        const vitePrefixes = ['/@vite', '/@fs', '/@id', '/@react-refresh', '/node_modules', '/__open-in-editor', '/.vite'];
        for (let i = 0; i < vitePrefixes.length; i++) {
            const prefix = vitePrefixes[i];
            app.get(`${prefix}/**`, async (ctx) => proxy(ctx, async () => { }));
            app.get(prefix, async (ctx) => proxy(ctx, async () => { }));
        }
    }

    private async initProd(app: Shokupan, viteConfig: { configFile: string; outDir: string } | null) {
        const fs = await import('node:fs');
        const path = await import('node:path');

        const outDir = this.outDir || viteConfig?.outDir || path.resolve(process.cwd(), 'dist');

        if (!fs.existsSync(outDir)) {
            app.logger?.warn('VitePlugin', `Production build directory not found: ${outDir}. Run your Vite build first.`);
            return;
        }

        // Serve static files under the mount path
        const serveStatic = async (ctx: any) => {
            const subPath = new URL(ctx.request.url).pathname.replace(this.mountPath, '') || '/';
            let filePath = join(outDir, subPath);

            if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
                filePath = join(outDir, 'index.html');
            }

            if (!fs.existsSync(filePath)) {
                return ctx.text('Not found', 404);
            }

            const file = Bun.file(filePath);
            return new Response(file, {
                headers: {
                    'Content-Type': file.type || 'application/octet-stream',
                    'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'max-age=31536000'
                }
            });
        };

        const staticExts = new Set([
            'js', 'mjs', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'woff', 'woff2',
            'ttf', 'eot', 'ico', 'json', 'map', 'wasm', 'webm', 'mp4', 'ogg', 'webp'
        ]);

        // For subpath mounts, a catch-all is safe because API routes live outside the mount path.
        if (this.mountPath !== '/') {
            app.get(`${this.mountPath}/**`, serveStatic);
            app.get(this.mountPath, serveStatic);
        }

        // SPA fallback: serve index.html for unmatched HTML requests,
        // and try to serve static files for paths with known extensions.
        if (this.spaFallback) {
            app.onStrictError(NotFoundError, async (err, ctx) => {
                const pathname = ctx.path;
                const ext = pathname.split('.').pop()?.toLowerCase() || '';

                // Try to serve an explicit static file if the path has a known extension
                if (ext && staticExts.has(ext)) {
                    const filePath = join(outDir, pathname);
                    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                        const file = Bun.file(filePath);
                        return new Response(file, {
                            headers: {
                                'Content-Type': file.type || 'application/octet-stream',
                                'Cache-Control': 'max-age=31536000'
                            }
                        });
                    }
                }

                // For page navigations (no extension, Accepts HTML), serve index.html.
                // Root path '/' is always served as index.html.
                const accept = ctx.request.headers.get('accept') || '';
                const isRoot = pathname === '/' || pathname === '';
                if (isRoot || accept.includes('text/html')) {
                    const indexPath = join(outDir, 'index.html');
                    if (fs.existsSync(indexPath)) {
                        const file = Bun.file(indexPath);
                        return new Response(file, {
                            headers: {
                                'Content-Type': 'text/html',
                                'Cache-Control': 'no-cache'
                            }
                        });
                    }
                }

                throw err;
            });
        }
    }
}
