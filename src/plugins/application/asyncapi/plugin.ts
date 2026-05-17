import type { ServerWebSocket } from 'bun';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShokupanRouter } from '../../../router';
import type { Shokupan } from '../../../shokupan';
import { deepMerge } from '../../../util/deep-merge';
import { getEditorLinkPattern } from '../../../util/ide';
import { $isMounted } from '../../../util/symbol';
import type { DeepPartial, ShokupanPlugin, ShokupanPluginOptions } from '../../../util/types';
import { generateAsyncApi } from './generator';
let renderToString: any;
async function getRenderToString() {
    if (!renderToString) {
        renderToString = (await import('preact-render-to-string')).default;
    }
    return renderToString;
}

// Lazy-load JSX components to avoid requiring preact for consumers that don't use AsyncApiPlugin
let AsyncApiApp: typeof import('./components.tsx').AsyncApiApp;
let buildNavTree: typeof import('./components.tsx').buildNavTree;
async function loadJsxComponents() {
    if (!AsyncApiApp || !buildNavTree) {
        const mod = await import('./components.tsx');
        AsyncApiApp = mod.AsyncApiApp;
        buildNavTree = mod.buildNavTree;
    }
}

export interface AsyncApiPluginOptions {
    path?: string;
    serverUrl?: string; // Override the default server URL (host:port)
    spec?: DeepPartial<any>;
    disableSourceView?: boolean;
    permissions?: {
        resource: string;
        action: string;
    };
}

export class AsyncApiPlugin extends ShokupanRouter<any> implements ShokupanPlugin {
    private clients = new Set<ServerWebSocket<any>>();
    private testBroadcastInterval: any = null;
    private appLogger: any = null;

    private static getBasePath() {
        const dir = dirname(fileURLToPath(import.meta.url));
        // In production (dist/), files are in dist/plugins/application/asyncapi/
        // Check if we're in the dist directory by looking for '/dist/' in the path
        if (dir.includes('/dist/')) {
            // Already in the correct directory (dist/plugins/application/asyncapi/)
            return dir;
        }
        // In dev mode (src/plugins/application/asyncapi/), files are in same directory
        return dir;
    }

    constructor(private pluginOptions: AsyncApiPluginOptions = {}) {
        super({ renderer: async (...args: any[]) => (await getRenderToString())(...args) });
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

    async onInit(app: Shokupan, options?: ShokupanPluginOptions) {
        this.appLogger = app.logger;

        if (!(this as any)[$isMounted]) {
            const path = this.pluginOptions.path || options?.path || '/asyncapi';
            app.mount(path, this);
        }

        const astFileName = app.applicationConfig.astFilePath || 'shokupan-ast.json';
        const specPath = join(process.cwd(), astFileName);

        if (!existsSync(specPath)) {
            app.applicationConfig.enableAsyncApiGen = true;
        } else if (app.applicationConfig.enableAsyncApiGen !== true) {
            app.logger?.info('AsyncApiPlugin', `Found ${astFileName}, using static spec instead of generating.`);
        }

        // Hook into AST analyzer to broadcast spec updates when analysis completes
        const useAsyncScanning = app.applicationConfig?.enableAsyncAstScanning ?? true;
        app.logger?.info('AsyncApiPlugin', `Async scanning enabled: ${useAsyncScanning}`);

        if (useAsyncScanning) {
            try {
                const { getGlobalAnalyzer } = await import('../../../util/ast-analyzer-worker');
                const analyzer = getGlobalAnalyzer();
                const state = analyzer.getState();

                app.logger?.info('AsyncApiPlugin', `AST analyzer state: ${state}`);

                // Listen for analysis completion
                analyzer.on('completed', (result) => {
                    app.logger?.info('AsyncApiPlugin', 'AST analysis completed event fired, broadcasting spec update');
                    this.broadcastSpecUpdate();
                });

                app.logger?.info('AsyncApiPlugin', 'Registered listener for AST analyzer completed event');

                // If already completed, we missed the event - broadcast now
                if (state === 'completed') {
                    app.logger?.info('AsyncApiPlugin', 'AST analysis already completed, broadcasting immediately');
                    this.broadcastSpecUpdate();
                }
            } catch (err) {
                app.logger?.warn('AsyncApiPlugin', 'Could not hook into AST analyzer:', err);
            }
        }
    }

    public onShutdown() {
        if (this.testBroadcastInterval) {
            clearInterval(this.testBroadcastInterval);
            this.testBroadcastInterval = null;
        }
        for (const client of this.clients) {
            try { client.close(); } catch { }
        }
        this.clients.clear();
    }

    private checkPermission(ctx: any): boolean {
        if (!this.pluginOptions.permissions) return true;
        const user = (ctx as any).user;
        if (!user) return false;
        const required = this.pluginOptions.permissions;
        const userPerms = user.permissions;
        if (!Array.isArray(userPerms)) return false;
        for (const p of userPerms) {
            if (typeof p === 'string') {
                const [resource, action] = p.split(':');
                if ((resource === '*' || resource === required.resource) && (action === '*' || action === required.action)) {
                    return true;
                }
            } else if (p && typeof p === 'object') {
                if ((p.resource === '*' || p.resource === required.resource) && (p.action === '*' || p.action === required.action)) {
                    return true;
                }
            }
        }
        return false;
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
            if (!this.checkPermission(ctx)) {
                return ctx.text('Forbidden', 403);
            }
            let spec = ctx.app?.asyncApiSpec;
            if (!spec) {
                spec = await generateAsyncApi(ctx.app!);
            }
            if (this.pluginOptions.spec) {
                deepMerge(spec, this.pluginOptions.spec);
            }

            const serverUrl = this.pluginOptions.serverUrl || `${ctx.hostname}:${ctx.app?.applicationConfig.port}`;
            const base = this.pluginOptions.path!;

            const disableSourceView = this.pluginOptions.disableSourceView;

            // Build navigation tree from spec
            try {
                await loadJsxComponents();
            } catch (err: any) {
                if (err.message?.includes('preact')) {
                    return ctx.text('AsyncAPI Explorer requires preact. Install preact to enable.', 503);
                }
                throw err;
            }
            const navTree = buildNavTree(spec);

            return ctx.jsx(AsyncApiApp({ spec, serverUrl, base, disableSourceView, navTree }));
        });

        this.get('/json', async ctx => {
            if (!this.checkPermission(ctx)) {
                return ctx.json({ error: 'Forbidden' }, 403);
            }
            // Always regenerate to ensure fresh AST analysis
            const spec = await generateAsyncApi(ctx.app!);

            if (this.pluginOptions.spec) {
                deepMerge(spec, this.pluginOptions.spec);
            }

            // Inject the IDE link pattern so the Angular client can build links client-side
            return ctx.json({
                ...spec,
                'x-ide-link-pattern': getEditorLinkPattern()
            });
        });

        this.get('/_code', async ctx => {
            if (!this.checkPermission(ctx)) {
                return ctx.text('Forbidden', 403);
            }
            const file = ctx.query['file'];
            if (!file || typeof file !== 'string') {
                return ctx.text('Missing file parameter', 400);
            }

            // Security: Validate path is within project root
            const { resolve } = await import('node:path');
            const cwd = process.cwd();
            const resolvedPath = resolve(cwd, file);

            if (!resolvedPath.startsWith(cwd + '/') && resolvedPath !== cwd) {
                return ctx.text('Forbidden: File must be within project root', 403);
            }

            try {
                const content = await readFile(resolvedPath, 'utf8');
                return ctx.text(content);
            } catch (e: any) {
                return ctx.text('File not found: ' + e.message, 404);
            }
        });

        // WebSocket endpoint for spec updates
        this.get('/ws', ctx => {
            if (!this.checkPermission(ctx)) {
                return ctx.text('Forbidden', 403);
            }
            return ctx.upgrade({
                open: (ctx, ws) => {
                    this.clients.add(ws);
                    this.appLogger?.info(`[AsyncAPI] Client connected. Total clients: ${this.clients.size}`);

                    // Start test broadcast if not already running
                    if (!this.testBroadcastInterval) {
                        this.appLogger?.info('[AsyncAPI] Starting test broadcast interval');
                        this.testBroadcastInterval = setInterval(() => {
                            this.broadcastTestEvent();
                        }, 5000);
                    }
                },
                message: (ctx, ws, message) => {
                    // Handle client messages if needed
                    this.appLogger?.info('[AsyncAPI] Received message from client:', message);
                },
                close: (ctx, ws) => {
                    this.clients.delete(ws);
                    this.appLogger?.info(`[AsyncAPI] Client disconnected. Total clients: ${this.clients.size}`);

                    // Stop test broadcast if no clients
                    if (this.clients.size === 0 && this.testBroadcastInterval) {
                        this.appLogger?.info('[AsyncAPI] Stopping test broadcast interval');
                        clearInterval(this.testBroadcastInterval);
                        this.testBroadcastInterval = null;
                    }
                }
            });
        });
    }

    private broadcastSpecUpdate() {
        if (this.clients.size === 0) return;

        const data = JSON.stringify({
            type: 'spec-updated',
            event: 'ast-complete'
        });

        for (const client of this.clients) {
            if (client?.send) {
                client.send(data);
            }
        }
    }

    private broadcastTestEvent() {
        if (this.clients.size === 0) return;

        const data = JSON.stringify({
            type: 'test-event',
            timestamp: new Date().toISOString(),
            message: 'Test broadcast from server',
            clientCount: this.clients.size
        });

        this.appLogger?.info(`[AsyncAPI] Broadcasting test event to ${this.clients.size} client(s)`);

        for (const client of this.clients) {
            if (client?.send) {
                client.send(data);
            }
        }
    }
}
