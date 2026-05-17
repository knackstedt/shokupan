import type { ServerWebSocket } from 'bun';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
let renderToString: any;
async function getRenderToString() {
    if (!renderToString) {
        renderToString = (await import('preact-render-to-string')).default;
    }
    return renderToString;
}
import { ShokupanRouter } from '../../../router';
import type { Shokupan } from '../../../shokupan';
import { deepMerge } from '../../../util/deep-merge';
import { getEditorLinkPattern } from '../../../util/ide';
import { $isMounted } from '../../../util/symbol';
import type { DeepPartial, ShokupanPlugin, ShokupanPluginOptions } from '../../../util/types';
import { ApiExplorerApp } from '../api-explorer/components.tsx';
import { AsyncApiApp, buildNavTree } from '../asyncapi/components.tsx';
import { generateAsyncApi } from '../asyncapi/generator';

export interface DebugPluginEndpointConfig {
    enabled?: boolean;
    permissions?: {
        resource: string;
        action: string;
    };
}

export interface DebugPluginOptions {
    path?: string;
    
    apiExplorer?: DebugPluginEndpointConfig & {
        enableSourceView?: boolean;
    };
    
    asyncApi?: DebugPluginEndpointConfig & {
        serverUrl?: string;
        spec?: DeepPartial<any>;
        disableSourceView?: boolean;
    };
}

/**
 * Unified Debug Plugin that consolidates API Explorer and AsyncAPI functionality.
 * Each endpoint can be individually enabled/disabled and have permission requirements.
 */
export class DebugPlugin extends ShokupanRouter<any> implements ShokupanPlugin {
    private clients = new Set<ServerWebSocket<any>>();
    private testBroadcastInterval: any = null;

    private static getBasePath() {
        const dir = dirname(fileURLToPath(import.meta.url));
        if (dir.includes('/dist/')) {
            return dir;
        }
        return dir;
    }

    constructor(private pluginOptions: DebugPluginOptions = {}) {
        super({ renderer: async (...args: any[]) => (await getRenderToString())(...args) });
        this.pluginOptions.path ??= '/debug';
        
        this.pluginOptions.apiExplorer ??= { enabled: true };
        this.pluginOptions.asyncApi ??= { enabled: true };

        this.metadata = {
            file: import.meta.file,
            line: 1,
            name: 'DebugPlugin',
            pluginName: 'Debug'
        };

        this.init();
    }

    async onInit(app: Shokupan, options?: ShokupanPluginOptions) {
        if (!(this as any)[$isMounted]) {
            const path = this.pluginOptions.path || options?.path || '/debug';
            app.mount(path, this);
        }

        if (this.pluginOptions.apiExplorer?.enabled !== false) {
            if (app.applicationConfig.enableOpenApiGen !== true) {
                app.logger?.warn('DebugPlugin', 'enableOpenApiGen is disabled. API Explorer will not generate spec.');
            }
        }

        if (this.pluginOptions.asyncApi?.enabled !== false) {
            const astFileName = app.applicationConfig.astFilePath || 'shokupan-ast.json';
            const specPath = join(process.cwd(), astFileName);

            if (!existsSync(specPath)) {
                app.applicationConfig.enableAsyncApiGen = true;
            } else if (app.applicationConfig.enableAsyncApiGen !== true) {
                app.logger?.info('DebugPlugin', `Found ${astFileName}, using static spec instead of generating.`);
            }

            if (app.applicationConfig.enableAsyncApiGen !== true && !existsSync(specPath)) {
                app.logger?.warn('DebugPlugin', 'enableAsyncApiGen is disabled. AsyncAPI will not generate spec.');
            }

            const useAsyncScanning = app.applicationConfig?.enableAsyncAstScanning ?? true;
            app.logger?.info('DebugPlugin', `Async scanning enabled: ${useAsyncScanning}`);
            
            if (useAsyncScanning) {
                try {
                    const { getGlobalAnalyzer } = await import('../../../util/ast-analyzer-worker');
                    const analyzer = getGlobalAnalyzer();
                    const state = analyzer.getState();
                    
                    app.logger?.info('DebugPlugin', `AST analyzer state: ${state}`);
                    
                    analyzer.on('completed', (result) => {
                        app.logger?.info('DebugPlugin', 'AST analysis completed event fired, broadcasting spec update');
                        this.broadcastSpecUpdate();
                    });
                    
                    app.logger?.info('DebugPlugin', 'Registered listener for AST analyzer completed event');
                    
                    if (state === 'completed') {
                        app.logger?.info('DebugPlugin', 'AST analysis already completed, broadcasting immediately');
                        this.broadcastSpecUpdate();
                    }
                } catch (err) {
                    app.logger?.warn('DebugPlugin', 'Could not hook into AST analyzer:', err);
                }
            }
        }
    }

    private checkPermission(ctx: any, config?: DebugPluginEndpointConfig): boolean {
        if (!config?.permissions) return true;
        
        const user = (ctx as any).user;
        if (!user) return false;

        return true;
    }

    private init() {
        const serveFile = async (ctx: any, file: string, type: string, subdir: string) => {
            const basePath = dirname(dirname(fileURLToPath(import.meta.url)));
            const content = await readFile(join(basePath, subdir, 'static', file), 'utf-8');
            ctx.set('Content-Type', type);
            return ctx.send(content);
        };

        if (this.pluginOptions.apiExplorer?.enabled !== false) {
            this.get('/explorer/style.css', ctx => serveFile(ctx, 'style.css', 'text/css', 'api-explorer'));
            this.get('/explorer/theme.css', ctx => serveFile(ctx, 'theme.css', 'text/css', 'api-explorer'));
            this.get('/explorer/explorer-client.mjs', ctx => serveFile(ctx, 'explorer-client.mjs', 'application/javascript', 'api-explorer'));

            const isProduction = process.env.NODE_ENV === 'production';
            const sourceViewEnabled = this.pluginOptions.apiExplorer?.enableSourceView ?? !isProduction;
            
            if (sourceViewEnabled) {
                this.get('/explorer/_source', async (ctx) => {
                    if (!this.checkPermission(ctx, this.pluginOptions.apiExplorer)) {
                        return ctx.text('Forbidden', 403);
                    }

                    const file = ctx.query['file'];
                    if (!file) return ctx.text('Missing file parameter', 400);

                    const { resolve } = await import('node:path');
                    const cwd = process.cwd();
                    const resolvedPath = resolve(cwd, file);

                    if (!resolvedPath.startsWith(cwd + '/') && resolvedPath !== cwd) {
                        return ctx.text('Forbidden: File must be within project root', 403);
                    }

                    try {
                        const content = await readFile(resolvedPath, 'utf-8');
                        return ctx.text(content);
                    } catch (err) {
                        return ctx.text('File not found', 404);
                    }
                });
            }

            this.get('/explorer/openapi.json', async (ctx) => {
                if (!this.checkPermission(ctx, this.pluginOptions.apiExplorer)) {
                    return ctx.json({ error: 'Forbidden' }, 403);
                }

                const spec = (this.root as any).openApiSpec
                    ? structuredClone((this.root as any).openApiSpec)
                    : await (this.root || this).generateApiSpec();
                return ctx.json(spec);
            });

            this.get('/explorer', async (ctx) => {
                if (!this.checkPermission(ctx, this.pluginOptions.apiExplorer)) {
                    return ctx.text('Forbidden', 403);
                }

                const spec = (this.root as any).openApiSpec
                    ? structuredClone((this.root as any).openApiSpec)
                    : await (this.root || this).generateApiSpec();
                const asyncSpec = (ctx.app as any).asyncApiSpec;
                const base = `${this.pluginOptions.path}/explorer`;
                const element = ApiExplorerApp({ spec: spec, base, asyncSpec });
                const html = (await getRenderToString())(element);
                if (html.length === 0) throw new Error('DebugPlugin: rendered API Explorer page is blank.');
                return ctx.html(html);
            });
        }

        if (this.pluginOptions.asyncApi?.enabled !== false) {
            this.get('/asyncapi/style.css', ctx => serveFile(ctx, 'style.css', 'text/css', 'asyncapi'));
            this.get('/asyncapi/theme.css', ctx => serveFile(ctx, 'theme.css', 'text/css', 'asyncapi'));
            this.get('/asyncapi/asyncapi-client.mjs', ctx => serveFile(ctx, 'asyncapi-client.mjs', 'application/javascript', 'asyncapi'));

            this.get('/asyncapi', async ctx => {
                if (!this.checkPermission(ctx, this.pluginOptions.asyncApi)) {
                    return ctx.text('Forbidden', 403);
                }

                let spec = ctx.app?.asyncApiSpec;
                if (!spec) {
                    spec = await generateAsyncApi(ctx.app!);
                }
                if (this.pluginOptions.asyncApi?.spec) {
                    deepMerge(spec, this.pluginOptions.asyncApi.spec);
                }

                const serverUrl = this.pluginOptions.asyncApi?.serverUrl || `${ctx.hostname}:${ctx.app?.applicationConfig.port}`;
                const base = `${this.pluginOptions.path}/asyncapi`;

                const disableSourceView = this.pluginOptions.asyncApi?.disableSourceView;

                const navTree = buildNavTree(spec);

                return ctx.jsx(AsyncApiApp({ spec, serverUrl, base, disableSourceView, navTree }));
            });

            this.get('/asyncapi/json', async ctx => {
                if (!this.checkPermission(ctx, this.pluginOptions.asyncApi)) {
                    return ctx.json({ error: 'Forbidden' }, 403);
                }

                const spec = await generateAsyncApi(ctx.app!);

                if (this.pluginOptions.asyncApi?.spec) {
                    deepMerge(spec, this.pluginOptions.asyncApi.spec);
                }

                return ctx.json({
                    ...spec,
                    'x-ide-link-pattern': getEditorLinkPattern()
                });
            });

            this.get('/asyncapi/_code', async ctx => {
                if (!this.checkPermission(ctx, this.pluginOptions.asyncApi)) {
                    return ctx.text('Forbidden', 403);
                }

                const file = ctx.query['file'];
                if (!file || typeof file !== 'string') {
                    return ctx.text('Missing file parameter', 400);
                }

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

            this.get('/asyncapi/ws', ctx => {
                if (!this.checkPermission(ctx, this.pluginOptions.asyncApi)) {
                    return ctx.text('Forbidden', 403);
                }

                return ctx.upgrade({
                    open: (ctx, ws) => {
                        this.clients.add(ws);
                        console.log(`[DebugPlugin] AsyncAPI client connected. Total clients: ${this.clients.size}`);
                        
                        if (!this.testBroadcastInterval) {
                            console.log('[DebugPlugin] Starting test broadcast interval');
                            this.testBroadcastInterval = setInterval(() => {
                                this.broadcastTestEvent();
                            }, 5000);
                        }
                    },
                    message: (ctx, ws, message) => {
                        console.log('[DebugPlugin] Received message from client:', message);
                    },
                    close: (ctx, ws) => {
                        this.clients.delete(ws);
                        console.log(`[DebugPlugin] AsyncAPI client disconnected. Total clients: ${this.clients.size}`);
                        
                        if (this.clients.size === 0 && this.testBroadcastInterval) {
                            console.log('[DebugPlugin] Stopping test broadcast interval');
                            clearInterval(this.testBroadcastInterval);
                            this.testBroadcastInterval = null;
                        }
                    }
                });
            });
        }
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

        console.log(`[DebugPlugin] Broadcasting test event to ${this.clients.size} client(s)`);

        for (const client of this.clients) {
            if (client?.send) {
                client.send(data);
            }
        }
    }
}
