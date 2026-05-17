import type { ServerWebSocket } from 'bun';
import { Glob } from 'bun';
import { nanoid } from 'nanoid';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import renderToString from 'preact-render-to-string';
import type { DebugCollector } from "../../../context";
import { ShokupanRouter } from "../../../router";
import type { Shokupan } from '../../../shokupan';
import { getEditorLinkPattern } from '../../../util/ide';
import { $appRoot, $childRouters, $debug, $mountPath, $onWsMessage, $wsMessages } from "../../../util/symbol";
import type { ShokupanHooks, ShokupanPlugin } from "../../../util/types";
import { DashboardApp } from './components';
import { FetchInterceptor, type OutboundRequestLog } from './fetch-interceptor';
import { MetricsCollector } from './metrics-collector';

/**
 * Match a hostname/IP against a glob pattern.
 * Supports `*` as a wildcard for an entire segment (IPv4 octet or IPv6 group).
 * Examples: '1.1.1.1', '10.0.0.*', '192.168.1.*', 'fe80::*', '*.example.com'
 */
function matchHostGlob(pattern: string, hostname: string): boolean {
    // Normalize to lowercase for case-insensitive matching
    const pat = pattern.toLowerCase();
    const host = hostname.toLowerCase();

    // Split by delimiters (dot for IPv4/domain, colon for IPv6)
    const patDelim = pat.includes(':') ? ':' : '.';
    const hostDelim = host.includes(':') ? ':' : '.';

    // If delimiters differ, only exact match is possible
    if (patDelim !== hostDelim) {
        return pat === host;
    }

    const patParts = pat.split(patDelim);
    const hostParts = host.split(hostDelim);

    if (patParts.length !== hostParts.length) {
        return false;
    }

    for (let i = 0; i < patParts.length; i++) {
        if (patParts[i] === '*') continue;
        if (patParts[i] !== hostParts[i]) return false;
    }
    return true;
}

interface RequestMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    activeRequests: number;
    averageTotalTime_ms: number;
    recentTimings: number[];
    logs: RequestLog[];
    rateLimitedCounts: Record<string, number>;

    // Graph Metrics
    nodeMetrics: Record<string, NodeMetric>;
    edgeMetrics: Record<string, number>;
}

interface NodeMetric {
    id: string;
    type: string;
    requests: number;
    totalTime: number;
    failures: number;
    name: string;
}

export interface RequestLog {
    method: string;
    url: string;
    status: number;
    duration: number;
    timestamp: number;
    handlerStack?: any[];
    body?: any;          // Optional: for small payloads or compatibility
    contentType?: string;
    // New fields
    type: 'xhr' | 'fetch' | 'ws' | 'inbound';
    direction: 'inbound' | 'outbound';
    size?: number;
    protocol?: string;
    domain?: string;
    path?: string;
    scheme?: string;
    remoteIP?: string;
    cookies?: number;
    transferred?: number;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: any;   // Optional
    responseBody?: any;  // Optional
    wsMessages?: any[];
    hasRequestBody?: boolean;
    hasResponseBody?: boolean;
    callStack?: string;
    isChunked?: boolean;
    isStreamed?: boolean;
    chunkTimings?: Array<{ timestamp: number; size: number; duration: number }>;
}

export interface DashboardConfig {
    getRequestHeaders?: () => HeadersInit;
    path?: string;
    /**
     * patterns to ignore in the request list.
     * Can be a glob pattern (string), regex, or a custom callback function.
     */
    ignorePatterns?: (string | RegExp | ((req: RequestLog) => boolean))[];
    /**
     * If true, the replay endpoint will be disabled.
     */
    disableReplay?: boolean;
    /**
     * Array of status codes to not record.
     */
    ignoreStatusCodes?: number[];
    /**
     * Array of HTTP methods to not record (e.g. ['OPTIONS', 'HEAD'])
     */
    ignoreMethods?: string[];
    /**
     * Retention time in milliseconds
     */
    retentionMs?: number;
    integrations?: {
        scalar?: boolean | { path?: string; };
        asyncapi?: boolean | { path?: string; };
        apiExplorer?: boolean | { path?: string; };
    };
    /**
     * Strategy for pushing request updates to the dashboard.
     * 'immediate' - pushes every request as soon as it completes.
     * 'batched' - buffers requests and pushes them at the interval specified by updateInterval.
     * @default 'immediate'
     */
    updateStrategy?: 'immediate' | 'batched';
    /**
     * Interval in milliseconds for pushing batched updates.
     * @default 10_000
     */
    updateInterval?: number;
    /**
     * Maximum number of request logs to keep in memory.
     * @default 1000
     */
    maxLogEntries?: number;
    /**
     * Track and display state mutations made by middleware.
     * Requires enableMiddlewareTracking to be enabled on the application.
     * When enabled, the dashboard will show what properties each middleware added/modified on ctx.state.
     * @default true (if enableMiddlewareTracking is enabled)
     */
    trackStateMutations?: boolean;
    /**
     * Allowed hosts/IPs for the replay endpoint.
     * Can be an array of glob patterns (e.g. '1.1.1.1', '10.0.0.*', '192.168.1.*')
     * or a custom function that receives the hostname and returns true if allowed.
     * If not provided, private/internal addresses remain blocked by default.
     */
    allowedReplayHosts?: string[] | ((hostname: string) => boolean);
}

class Collector implements DebugCollector {
    private currentNode: string | undefined;

    constructor(private dashboard: Dashboard) { }

    trackStep(id: string | undefined, type: string, duration: number, status: 'success' | 'error', error?: any) {
        if (!id) return;
        this.dashboard.recordNodeMetric(id, type, duration, status === 'error');
    }

    trackEdge(fromId: string | undefined, toId: string | undefined) {
        if (!fromId || !toId) return;
        this.dashboard.recordEdgeMetric(fromId, toId);
    }

    setNode(id: string) {
        this.currentNode = id;
    }

    getCurrentNode(): string | undefined {
        return this.currentNode;
    }
}

/**
 * The Dashboard plugin provides a web interface for monitoring and debugging the Shokupan application.
 * It allows you to view request logs, metrics, and other debugging information. Additionally,
 * this plugin shows the scalar, asyncapi and openapi plugins if they are enabled.
 * It uses WebSockets to push updates to the dashboard in real-time.
 * 
 * This plugin will automatically enable the metrics plugin and the fetch interceptor. These are 
 * required for the dashboard to function. The fetch interceptor will track all requests and 
 * responses for use in the dashboard and Network tab.
 * 
 * When enabled, enableMiddlewareTracking will automatically be enabled on the application.
 */
export class Dashboard implements ShokupanPlugin {
    public readonly metadata = {
        pluginName: 'Dashboard'
    };

    private [$appRoot]: Shokupan;

    private router = new ShokupanRouter({ renderer: renderToString });
    private metrics: RequestMetrics = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        activeRequests: 0,
        averageTotalTime_ms: 0,
        recentTimings: [],
        logs: [],
        rateLimitedCounts: {},
        nodeMetrics: {},
        edgeMetrics: {}
    };

    private clients = new Set<ServerWebSocket<any>>();
    private broadcastTimer: any;
    private requestPushTimer: any;
    private requestsBuffer: any[] = [];

    private startTime = Date.now();
    private instrumented = false;
    private mountPath = '/dashboard';
    private metricsCollector: MetricsCollector;
    get db() {
        return this[$appRoot].db;
    }

    constructor(private readonly dashboardConfig: DashboardConfig = {}) { }

    // ShokupanPlugin interface implementation
    public onInit(app: any, options?: { path?: string; }) {
        this[$appRoot] = app;

        // Subscribe to MetricsCollector updates
        const onCollect = (metric: any) => {
            this.broadcastMetricUpdate(metric);
        };

        this.metricsCollector = new MetricsCollector(this.db, onCollect, app.logger);

        if (app.applicationConfig) {
            app.applicationConfig.enableMiddlewareTracking = true;
        }

        // Initialize Fetch Interceptor
        const fetchInterceptor = new FetchInterceptor(app.logger);
        fetchInterceptor.patch();
        fetchInterceptor.on((log: OutboundRequestLog) => {
            // Prevent infinite loop by ignoring DB requests
            // SurrealDB driver uses /rpc endpoint
            if (log.url.includes('/rpc')) return;
            try {
                const u = new URL(log.url);
                if (u.pathname.startsWith(this.mountPath)) return;
            } catch (e) { }

            // Store outbound request
            const requestData: RequestLog = {
                method: log.method,
                url: log.url,
                status: log.status,
                duration: log.duration,
                timestamp: log.startTime, // Use startTime as timestamp
                type: 'fetch',
                direction: 'outbound',
                size: log.responseSize || (log.responseBody ? (typeof log.responseBody === 'string' ? log.responseBody.length : ((log.responseBody instanceof ArrayBuffer || log.responseBody instanceof Uint8Array) ? log.responseBody.byteLength : 0)) : 0),
                contentType: log.responseHeaders['content-type'] || log.responseHeaders['Content-Type'],
                // Large bodies removed from main log
                domain: log.domain,
                path: log.path,
                scheme: log.scheme,
                protocol: log.protocol,
                remoteIP: log.remoteIP,
                cookies: log.cookies,
                transferred: log.transferred,
                requestHeaders: log.requestHeaders,
                hasRequestBody: !!log.requestBody,
                hasResponseBody: !!log.responseBody,
                callStack: log.callStack
            };

            // Check ignore options
            if (this.shouldIgnoreRequest(requestData)) return;

            // Route to Third-Party metrics collection
            this.metricsCollector.recordThirdPartyRequest(log.duration, log.status >= 400);

            // Enforce log limit
            const maxLogs = this.dashboardConfig.maxLogEntries ?? 1000;
            if (this.metrics.logs.length >= maxLogs) {
                this.metrics.logs.shift();
            }
            this.metrics.logs.push(requestData);

            // Fire and forget save
            const save = async () => {
                await this[$appRoot].dbPromise;
                if (!this.db) return;

                const idString = `req_${Date.now()}_${nanoid()}`;

                try {
                    await this.db.upsert('request', idString, {
                        ...requestData,
                        id: idString
                    });

                    // Save payloads separately
                    if (log.requestBody) {
                        this.db.upsert('payload', `${idString}:request`, { data: this.serializeBody(log.requestBody, false) }).catch(() => { });
                    }
                    if (log.responseBody) {
                        this.db.upsert('payload', `${idString}:response`, { data: this.serializeBody(log.responseBody, false) }).catch(() => { });
                    }

                    // Broadcast
                    const strategy = this.dashboardConfig.updateStrategy || 'immediate';
                    if (strategy === 'immediate') {
                        this.broadcastRequestUpdates([{ ...requestData, id: idString }]);
                    } else {
                        this.requestsBuffer.push({ ...requestData, id: idString });
                    }
                } catch (e) {
                    this[$appRoot]?.logger?.error('Dashboard', "Failed to save outbound request", { error: e });
                }
            };

            save();
        });

        if (app.onStart) {
            app.onStart(async () => {
                if (app.dbPromise) {
                    await app.dbPromise;
                    if (app.db) {
                        this.metricsCollector.db = app.db;
                        app.logger?.debug('Dashboard', 'Attached datastore to MetricsCollector');
                    }
                }
            });
        }
        this.mountPath = options?.path || this.dashboardConfig.path || '/dashboard';

        // Register hooks on the app to track all requests
        const hooks = this.getHooks();

        if (hooks.onRequestStart) {
            app.hook('onRequestStart', hooks.onRequestStart);
        }

        if (hooks.onResponseEnd) {
            app.hook('onResponseEnd', hooks.onResponseEnd);
        }

        // Mount the dashboard router
        app.mount(this.mountPath, this.router);

        // Metadata for registry
        this.router.metadata = {
            file: import.meta.file,
            line: 1,
            name: 'DashboardPlugin',
            pluginName: 'Dashboard'
        };

        // Set up all routes on the internal router
        this.setupRoutes();

        // Start request push timer if batched
        const strategy = this.dashboardConfig.updateStrategy || 'immediate';
        if (strategy === 'batched') {
            this.startRequestPushTimer();
        }
    }

    private detectIntegrations() {
        const integrations: Record<string, string | undefined> = {};
        const routers = this[$appRoot]?.[$childRouters] || [];
        // Helper to check config
        const checkConfig = (key: 'scalar' | 'asyncapi' | 'apiExplorer') => {
            const conf = this.dashboardConfig.integrations?.[key];
            if (conf === false) return { enabled: false };
            if (typeof conf === 'object' && conf.path) return { enabled: true, path: conf.path };
            return { enabled: true };
        };

        // Scalar
        const scalarConf = checkConfig('scalar');
        if (scalarConf.enabled) {
            if (scalarConf.path) {
                integrations['scalar'] = scalarConf.path;
            } else {
                const plugin = routers.find(r => r.metadata?.pluginName === 'Scalar');
                if (plugin) {
                    integrations['scalar'] = (plugin as any)[$mountPath];
                }
            }
        }

        // Check for unified DebugPlugin first
        const debugPlugin = routers.find(r => r.metadata?.pluginName === 'Debug');
        if (debugPlugin) {
            const debugPath = (debugPlugin as any)[$mountPath];

            // AsyncAPI via DebugPlugin
            const asyncApiConf = checkConfig('asyncapi');
            if (asyncApiConf.enabled) {
                if (asyncApiConf.path) {
                    integrations['asyncapi'] = asyncApiConf.path;
                } else {
                    integrations['asyncapi'] = `${debugPath}/asyncapi`;
                }
            }

            // API Explorer via DebugPlugin
            const apiExplorerConf = checkConfig('apiExplorer');
            if (apiExplorerConf.enabled) {
                if (apiExplorerConf.path) {
                    integrations['apiExplorer'] = apiExplorerConf.path;
                } else {
                    integrations['apiExplorer'] = `${debugPath}/explorer`;
                }
            }
        } else {
            // Fallback to legacy standalone plugins
            const asyncApiConf = checkConfig('asyncapi');
            if (asyncApiConf.enabled) {
                if (asyncApiConf.path) {
                    integrations['asyncapi'] = asyncApiConf.path;
                } else {
                    const plugin = routers.find(r => r.metadata?.pluginName === 'AsyncAPI');
                    if (plugin) {
                        integrations['asyncapi'] = (plugin as any)[$mountPath];
                    }
                }
            }

            const apiExplorerConf = checkConfig('apiExplorer');
            if (apiExplorerConf.enabled) {
                if (apiExplorerConf.path) {
                    integrations['apiExplorer'] = apiExplorerConf.path;
                } else {
                    const plugin = routers.find(r => r.metadata?.pluginName === 'ApiExplorer');
                    if (plugin) {
                        integrations['apiExplorer'] = (plugin as any)[$mountPath];
                    }
                }
            }
        }

        return integrations;
    }

    // Get base path for dashboard files - works in both dev (src/) and production (dist/)
    private static getBasePath() {
        const dir = dirname(fileURLToPath(import.meta.url));
        // In production (dist/), files are in dist/plugins/application/dashboard/
        if (dir.endsWith('dist')) {
            return dir + '/plugins/application/dashboard';
        }
        // In dev mode (src/plugins/application/dashboard/), files are in same directory
        return dir;
    }

    private setupRoutes() {
        // WebSocket endpoint for dashboard live updates
        this.router.get("/ws", (ctx) => {
            ctx.upgrade({
                open: (ctx, ws) => {
                    this.clients.add(ws);
                    // Send default 1m history
                    this.sendHistory(ws, '1m');
                },
                message: (ctx, ws, message) => {
                    try {
                        const msg = JSON.parse(message as string);
                        if (msg.type === 'get-history') {
                            this.sendHistory(ws, msg.interval || '1m');
                        }
                    } catch (e) { }
                },
                close: (ctx, ws) => {
                    this.clients.delete(ws);
                }
            });
        });

        this.router.get("/metrics", async (ctx) => {
            const uptime = this.getUptime();
            const interval = ctx.query['interval'];
            if (interval) {
                const intervalMap: Record<string, number> = {
                    '10s': 10 * 1000,
                    '1m': 60 * 1000,
                    '5m': 5 * 60 * 1000,
                    '30m': 30 * 60 * 1000,
                    '1h': 60 * 60 * 1000,
                    '2h': 2 * 60 * 60 * 1000,
                    '6h': 6 * 60 * 60 * 1000,
                    '12h': 12 * 60 * 60 * 1000,
                    '1d': 24 * 60 * 60 * 1000,
                    '3d': 3 * 24 * 60 * 60 * 1000,
                    '7d': 7 * 24 * 60 * 60 * 1000,
                    '30d': 30 * 24 * 60 * 60 * 1000,
                };
                const ms = intervalMap[interval] || 60 * 1000;
                const startTime = Date.now() - ms;

                await this[$appRoot].dbPromise;
                // Helper to perform in-memory aggregation if DB doesn't support complex query
                const requests = await this.db.findMany<any>('request', {
                    where: {
                        // Generic adapter doesn't support complex where clauses like "timestamp >" easily in `where` object unless extended.
                        // Our QueryOptions support `gt: { timestamp: startTime }`.
                    },
                    gt: { timestamp: startTime }
                });

                const total = requests.length;
                const success = requests.filter(r => r.status < 400).length;
                const failed = requests.filter(r => r.status >= 400).length;
                const avg_latency = total > 0
                    ? requests.reduce((acc, r) => acc + (r.duration || 0), 0) / total
                    : 0;

                return ctx.json({
                    metrics: {
                        totalRequests: this.metrics.totalRequests, // Current instance metrics
                        successfulRequests: this.metrics.successfulRequests,
                        failedRequests: this.metrics.failedRequests,
                        activeRequests: this.metrics.activeRequests,
                        averageTotalTime_ms: avg_latency, // Calculated from window
                        recentTimings: this.metrics.recentTimings,
                        logs: [],
                        rateLimitedCounts: this.metrics.rateLimitedCounts,
                        nodeMetrics: this.metrics.nodeMetrics,
                        edgeMetrics: this.metrics.edgeMetrics
                    },
                    uptime
                });
            }

            return ctx.json({
                metrics: this.metrics,
                uptime
            });
        });

        this.router.get("/metrics/history", async (ctx) => {
            // For history, we usually want `metrics` table points.
            // But if we are calculating on the fly, we don't store snapshots.
            // Assuming MetricsCollector stores snapshots in 'metrics' table.

            // The MetricsCollector logic needs verification if it uses `create` or `insert`.
            // Assuming it uses standard adapter logic now.

            const interval = ctx.query['interval'] || '1m';
            const intervalMap: Record<string, number> = {
                '10s': 10 * 1000,
                '1m': 60 * 1000,
                '5m': 5 * 60 * 1000,
                '30m': 30 * 60 * 1000,
                '1h': 60 * 60 * 1000,
                '2h': 2 * 60 * 60 * 1000,
                '6h': 6 * 60 * 60 * 1000,
                '12h': 12 * 60 * 60 * 1000,
                '1d': 24 * 60 * 60 * 1000,
                '3d': 3 * 24 * 60 * 60 * 1000,
                '7d': 7 * 24 * 60 * 60 * 1000,
                '30d': 30 * 24 * 60 * 60 * 1000,
            };
            const periodMs = intervalMap[interval] || 60 * 1000;
            const startTime = Date.now() - (periodMs * 3);

            await this[$appRoot].dbPromise;
            const metrics = await this.db.findMany<any>('metrics', {
                gt: { timestamp: startTime },
                where: { interval },
                sort: { timestamp: 'asc' }
            });

            return ctx.json({ metrics });
        });

        // Helper for start time calculation
        const getIntervalStartTime = (interval?: string) => {
            if (!interval) return 0;
            const intervalMap: Record<string, number> = {
                '10s': 10 * 1000,
                '1m': 60 * 1000,
                '5m': 5 * 60 * 1000,
                '30m': 30 * 60 * 1000,
                '1h': 60 * 60 * 1000,
                '2h': 2 * 60 * 60 * 1000,
                '6h': 6 * 60 * 60 * 1000,
                '12h': 12 * 60 * 60 * 1000,
                '1d': 24 * 60 * 60 * 1000,
                '3d': 3 * 24 * 60 * 60 * 1000,
                '7d': 7 * 24 * 60 * 60 * 1000,
                '30d': 30 * 24 * 60 * 60 * 1000,
            };
            const ms = intervalMap[interval] || 0;
            return ms ? Date.now() - ms : 0;
        };

        // Top Requests Endpoint
        this.router.get("/requests/top", async (ctx) => {
            const startTime = getIntervalStartTime(ctx.query['interval']);

            await this[$appRoot].dbPromise;
            const requests = await this.db.findMany<any>('request', {
                gt: { timestamp: startTime }
            });

            // Aggregate in-memory
            const counts: Record<string, { method: string, url: string, count: number; }> = {};
            for (const req of requests) {
                const key = `${req.method}:${req.url}`;
                if (!counts[key]) counts[key] = { method: req.method, url: req.url, count: 0 };
                counts[key].count++;
            }

            const top = Object.values(counts)
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            return ctx.json({ top });
        });

        // Top Errors Endpoint
        this.router.get("/errors/top", async (ctx) => {
            const startTime = getIntervalStartTime(ctx.query['interval']);

            // Note: failed_request table logic is same as request table but filtering?
            // Or does app specifically write to failed_request table?
            // "FailedRequestRecorder" plugin usually does.
            // If we use separate table:
            await this[$appRoot].dbPromise;
            const requests = await this.db.findMany<any>('failed_request', {
                gt: { timestamp: startTime }
            });

            const counts: Record<string, { status: number, count: number; }> = {};
            for (const req of requests) {
                const key = String(req.status);
                if (!counts[key]) counts[key] = { status: req.status, count: 0 };
                counts[key].count++;
            }

            const top = Object.values(counts)
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            return ctx.json({ top });
        });

        // Failing Requests Endpoint
        this.router.get("/requests/failing", async (ctx) => {
            const startTime = getIntervalStartTime(ctx.query['interval']);
            await this[$appRoot].dbPromise;
            const requests = await this.db.findMany<any>('failed_request', {
                gt: { timestamp: startTime }
            });

            const counts: Record<string, { method: string, url: string, count: number; }> = {};
            for (const req of requests) {
                const key = `${req.method}:${req.url}`;
                if (!counts[key]) counts[key] = { method: req.method, url: req.url, count: 0 };
                counts[key].count++;
            }

            const top = Object.values(counts)
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            return ctx.json({ top });
        });

        // Slowest Requests Endpoint
        this.router.get("/requests/slowest", async (ctx) => {
            const startTime = getIntervalStartTime(ctx.query['interval']);

            await this[$appRoot].dbPromise;
            // If adapter supports sort, let's use it.
            const requests = await this.db.findMany<any>('request', {
                gt: { timestamp: startTime },
                sort: { duration: 'desc' },
                limit: 10
            });

            return ctx.json({ slowest: requests });
        });

        this.router.get("/registry", (ctx) => {
            const app = this[$appRoot];
            if (!this.instrumented && app) {
                this.instrumentApp(app);
            }
            const registry = app?.registry;
            if (registry) {
                this.assignIdsToRegistry(registry, 'root');
            }
            return ctx.json({ registry: registry || {} });
        });

        // Requests Listing Endpoint
        this.router.get("/requests", async (ctx) => {
            await this[$appRoot].dbPromise;
            if (!this.db) return ctx.json({ requests: [...this.metrics.logs].reverse().slice(0, 100) });
            const result = await this.db.findMany('request', {
                sort: { timestamp: 'desc' },
                limit: 100
            });
            return ctx.json({ requests: result });
        });

        this.router.delete("/requests", async (ctx) => {
            this[$appRoot]?.logger?.debug('Dashboard', `Purging all requests`);
            if (this.db) {
                await this.db.deleteMany('request');
                await this.db.deleteMany('failed_request');
            }
            this.metrics.logs = [];
            this.metrics.totalRequests = 0;
            this.metrics.activeRequests = 0;
            this.metrics.successfulRequests = 0;
            this.metrics.failedRequests = 0;
            this.metrics.recentTimings = [];
            this.metrics.rateLimitedCounts = {};
            this.metrics.nodeMetrics = {};
            this.metrics.edgeMetrics = {};
            return ctx.json({ success: true });
        });

        // Request Details Endpoint
        this.router.get("/requests/:id", async (ctx) => {
            await this[$appRoot].dbPromise;
            if (!this.db) return ctx.json({ request: null });

            let id = decodeURIComponent(ctx.params['id']);
            if (id.startsWith('request:')) id = id.substring(8);
            if (id.startsWith('failed_request:')) id = id.substring(15);
            // Strip decorative brackets if present
            id = id.replace(/[⟨⟩]/g, '');

            let result = await this.db.get('request', id);

            // Fallback to failed_request table
            if (!result) {
                let failedId = id;
                if (failedId.startsWith('failed_')) failedId = failedId.substring(7);
                result = await this.db.get('failed_request', failedId);

                // Try with prefix if still not found
                if (!result) {
                    result = await this.db.get('failed_request', `failed_${failedId}`);
                }
            }

            return ctx.json({ request: result });
        });

        // Request Payload Endpoint (streaming)
        this.router.get("/requests/:id/payload/:type", async (ctx) => {
            await this[$appRoot].dbPromise;
            if (!this.db) return ctx.json({ error: "No database" }, 500);
            let requestId = decodeURIComponent(ctx.params['id']);
            const type = ctx.params['type']; // 'request' or 'response'

            // Strip table prefixes if present
            if (requestId.startsWith('request:')) requestId = requestId.substring(8);
            if (requestId.startsWith('failed_request:')) requestId = requestId.substring(15);
            if (requestId.startsWith('failed_')) requestId = requestId.substring(7);
            // Strip decorative brackets if present
            requestId = requestId.replace(/[⟨⟩]/g, '');

            let result = await this.db.get<any>('payload', `${requestId}:${type}`);

            // Fallback to failed prefix if not found (older stored format support)
            if (!result) {
                result = await this.db.get<any>('payload', `failed_${requestId}:${type}`);
            }

            if (!result || !result.data) {
                this[$appRoot].logger?.warn('Dashboard', `Payload NOT FOUND for ${requestId}:${type}`);
                return ctx.json({ error: "Payload not found" }, 404);
            }

            const body = result.data;

            // Handle binary data from __binary format
            if (typeof body === 'object' && body.__binary) {
                const buffer = Buffer.from(body.data, 'base64');

                // Return as binary stream
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(new Uint8Array(buffer));
                        controller.close();
                    }
                });

                return new Response(stream, {
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Content-Length': buffer.length.toString()
                    }
                });
            }

            // Handle string or JSON
            const content = typeof body === 'string' ? body : JSON.stringify(body);
            const encoder = new TextEncoder();
            const buffer = encoder.encode(content);

            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(buffer);
                    controller.close();
                }
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json',
                    'Content-Length': buffer.length.toString()
                }
            });
        });

        // Replay/Failed Requests Endpoints
        this.router.get("/failures", async (ctx) => {
            await this[$appRoot].dbPromise;
            const result = await this.db.findMany('failed_request', {
                sort: { timestamp: 'desc' },
                limit: 50
            });
            return ctx.json({ failures: result });
        });



        if (!this.dashboardConfig.disableReplay) {
            this.router.post("/replay", async (ctx) => {
                try {
                    const body = await ctx.body();
                    this[$appRoot]?.logger?.debug('Dashboard', 'Replay request received', { body });

                    // Logic to replay request:
                    // If direction is outbound, we fetch from the server.
                    // If inbound, we process via app.internalRequest.

                    const direction = body.direction || 'inbound';

                    if (direction === 'outbound') {
                        // Replay outbound request
                        const start = performance.now();
                        try {
                            // SSRF protection: validate URL before fetching
                            const validation = Dashboard.validateReplayUrl(body.url, this.mountPath, this.dashboardConfig.allowedReplayHosts);
                            if (validation.error) {
                                return ctx.json({ error: validation.error }, 400);
                            }

                            const res = await fetch(body.url, {
                                method: body.method,
                                headers: body.headers,
                                body: body.body ? (typeof body.body === 'object' ? JSON.stringify(body.body) : body.body) : undefined
                            });

                            // Read response text
                            const text = await res.text();
                            const duration = performance.now() - start;

                            const resHeaders: Record<string, string> = {};
                            res.headers.forEach((v, k) => resHeaders[k] = v);

                            return ctx.json({
                                status: res.status,
                                statusText: res.statusText,
                                headers: resHeaders,
                                data: text,
                                duration
                            });
                        } catch (e) {
                            this[$appRoot]?.logger?.error('Dashboard', 'Outbound replay failed', { error: e });
                            return ctx.json({ error: String(e) }, 500);
                        }
                    } else {
                        // Replay inbound request against the app
                        const app = this[$appRoot];
                        if (!app) {
                            this[$appRoot]?.logger?.error('Dashboard', 'App not available for replay');
                            return ctx.json({ error: "App not available" }, 500);
                        }

                        // Construct request
                        const start = performance.now();
                        try {
                            // Extract path from URL if it's a full URL
                            let path = body.url;
                            try {
                                const urlObj = new URL(body.url);
                                path = urlObj.pathname + urlObj.search + urlObj.hash;
                            } catch {
                                // If URL parsing fails, assume it's already a path
                            }

                            // Prefill IP address from the current requester (the person replaying)
                            const headers = { ...body.headers };
                            const currentIP = (ctx as any)._cachedRemoteIP || ctx.request.headers.get('x-forwarded-for') || (ctx.req as any)?.socket?.remoteAddress;
                            if (currentIP && !headers['x-forwarded-for']) {
                                headers['x-forwarded-for'] = currentIP;
                            }

                            this[$appRoot]?.logger?.debug('Dashboard', 'Replaying inbound request', {
                                method: body.method,
                                url: body.url,
                                path: path,
                                hasHeaders: !!body.headers,
                                hasBody: !!body.body,
                                requesterIP: currentIP
                            });

                            // body should contain method, url, headers, body
                            const result = await app.internalRequest({
                                method: body.method,
                                path: path,
                                headers: headers,
                                body: body.body
                            });

                            this[$appRoot]?.logger?.debug('Dashboard', 'Internal request completed', {
                                status: result.status,
                                hasHeaders: !!result.headers
                            });

                            // Extract headers from Response object
                            const resHeaders: Record<string, string> = {};
                            result.headers.forEach((v, k) => resHeaders[k] = v);

                            // Extract body from Response object
                            const text = await result.text();
                            const duration = performance.now() - start;

                            this[$appRoot]?.logger?.debug('Dashboard', 'Replay successful', { status: result.status, duration });

                            return ctx.json({
                                status: result.status,
                                statusText: result.statusText,
                                headers: resHeaders,
                                data: text,
                                duration
                            });
                        } catch (e) {
                            this[$appRoot]?.logger?.error('Dashboard', 'Inbound replay failed', { error: e, stack: (e as Error).stack });
                            return ctx.json({ error: String(e) }, 500);
                        }
                    }
                } catch (e) {
                    this[$appRoot]?.logger?.error('Dashboard', 'Replay endpoint error', { error: e, stack: (e as Error).stack });
                    return ctx.json({ error: String(e) }, 500);
                }
            });
        }

        this.router.get("/**", async (ctx) => {
            // Determine relative path by stripping the mount path
            const mountPath = this.router[$mountPath] || this.dashboardConfig.path || '/dashboard';

            let relativePath = ctx.path;
            if (relativePath.startsWith(mountPath)) {
                relativePath = relativePath.slice(mountPath.length);
            }
            // Strip leading slash
            if (relativePath.startsWith('/')) {
                relativePath = relativePath.slice(1);
            }

            const path = relativePath;

            // Serve static files if they match known extensions/files
            const staticFiles = [
                'charts.js', 'failures.js', 'graph.mjs', 'client.js',
                'reactflow.css', 'registry.css', 'registry.js', 'requests.js',
                'styles.css', 'tables.js', 'tabs.js', 'tabulator.css', 'theme.css',
                'timeline.js', 'replay.js', 'init_controls.js'
            ];

            if (staticFiles.includes(path)) {
                const content = await readFile(join(Dashboard.getBasePath(), 'static', path), 'utf-8');
                if (path.endsWith('.css')) ctx.set('Content-Type', 'text/css');
                else if (path.endsWith('.js') || path.endsWith('.mjs')) ctx.set('Content-Type', 'application/javascript');
                return ctx.send(content);
            }

            // Otherwise serve Dashboard
            const uptime = this.getUptime();

            const linkPattern = this.getLinkPattern();
            const integrations = this.detectIntegrations();

            const getRequestHeadersSource = this.dashboardConfig.getRequestHeaders ? this.dashboardConfig.getRequestHeaders.toString() : "undefined";


            const ignorePaths = [
                // Add default ignores for integrations
                ...Object.values(integrations).filter(p => !!p && p !== '/' && p.startsWith('/')).flatMap(p => {
                    const clean = p!.endsWith('/') ? p!.slice(0, -1) : p!;
                    return [clean, `${clean}/**`];
                })
            ];

            const html = renderToString(DashboardApp({
                metrics: this.metrics,
                uptime,
                rootPath: process.cwd(),
                linkPattern,
                integrations,
                base: mountPath,
                getRequestHeadersSource,
                ignorePaths
            }));
            return ctx.html(`<!DOCTYPE html>${html}`);
        });
    }

    private shouldIgnoreRequest(req: RequestLog): boolean {
        const path = (req.path || '').replace(/\/+/g, '/');

        // Status Codes
        if (this.dashboardConfig.ignoreStatusCodes?.includes(req.status)) return true;

        // Methods
        if (this.dashboardConfig.ignoreMethods?.includes(req.method)) return true;

        // Patterns
        if (this.dashboardConfig.ignorePatterns) {
            for (const pattern of this.dashboardConfig.ignorePatterns) {
                if (typeof pattern === 'string') {
                    const glob = new Glob(pattern);
                    if (glob.match(req.url) || glob.match(path)) return true;
                } else if (pattern instanceof RegExp) {
                    if (pattern.test(req.url) || pattern.test(path)) return true;
                } else if (typeof pattern === 'function') {
                    if (pattern(req)) return true;
                }
            }
        }
        return false;
    }

    private getUptime() {
        const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
        return `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;
    }

    private getPublicMetrics() {
        return {
            totalRequests: this.metrics.totalRequests,
            successfulRequests: this.metrics.successfulRequests,
            failedRequests: this.metrics.failedRequests,
            activeRequests: this.metrics.activeRequests,
            averageTotalTime_ms: this.metrics.averageTotalTime_ms,
            recentTimings: this.metrics.recentTimings,
            logs: [], // Don't broadcast logs for now to save bandwidth
            rateLimitedCounts: this.metrics.rateLimitedCounts,
            nodeMetrics: this.metrics.nodeMetrics,
            edgeMetrics: this.metrics.edgeMetrics
        };
    }

    private broadcastMetricUpdate(metric: any) {
        if (this.clients.size === 0) return;
        // this[$appRoot]?.logger?.debug('Dashboard', `Broadcasting metric update to ${this.clients.size} clients`);

        const data = JSON.stringify({
            type: 'metric-update',
            metric
        });

        for (const client of this.clients) {
            if (client?.send) {
                client.send(data);
            }
        }
    }

    private async sendHistory(ws: ServerWebSocket<any>, interval: string) {
        this[$appRoot]?.logger?.debug('Dashboard', `sendHistory called for interval: ${interval}`);
        // Map interval to milliseconds
        const intervalMap: Record<string, number> = {
            '10s': 10 * 1000,
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '2h': 2 * 60 * 60 * 1000,
            '6h': 6 * 60 * 60 * 1000,
            '12h': 12 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '3d': 3 * 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
        };

        const periodMs = intervalMap[interval] || 60 * 1000;
        const startTime = Date.now() - (periodMs * 30); // Get 30 points of history

        this[$appRoot]?.logger?.debug('Dashboard', `Fetching history from timestamp ${startTime}, period: ${periodMs}ms`);

        let history: any[] = [];
        await this[$appRoot].dbPromise;
        try {
            history = await this.db.findMany<any>('metrics', {
                gt: { timestamp: startTime },
                where: { interval },
                sort: { timestamp: 'asc' }
            });
            this[$appRoot]?.logger?.debug('Dashboard', `Fetched ${history.length} history points for interval ${interval}`);
        } catch (e) {
            this[$appRoot]?.logger?.error('Dashboard', 'Failed to fetch history for WS', { error: e });
        }

        const message = {
            type: 'init',
            metrics: { ...this.metrics, logs: [] },
            uptime: this.getUptime(),
            history
        };

        this[$appRoot]?.logger?.debug('Dashboard', `Sending init message with ${history.length} history points`);

        // Ensure WS is still valid after async operation
        if (ws && typeof ws.send === 'function') {
            ws.send(JSON.stringify(message));
            this[$appRoot]?.logger?.debug('Dashboard', `Init message sent successfully`);
        }
    }

    private broadcastMetrics() {
        if (this.clients.size === 0) return;
        this[$appRoot]?.logger?.debug('Dashboard', `Broadcasting metrics to ${this.clients.size} clients`);

        const data = JSON.stringify({
            type: 'metrics',
            metrics: this.getPublicMetrics(),
            uptime: this.getUptime()
        });

        for (const client of this.clients) {
            if (client?.send) {
                client.send(data);
            }
        }
    }

    private instrumentApp(app: any) {
        if (!app.getComponentRegistry) return;

        const registry = app.getComponentRegistry();
        this.assignIdsToRegistry(registry, 'root');
        this.instrumented = true;
    }

    // Traverses registry, generates IDs, and attaches them to the actual function objects
    private assignIdsToRegistry(node: any, parentId: string) {
        if (!node) return;

        const makeId = (type: string, parent: string, idx: number, name: string) =>
            `${type}_${parent}_${idx}_${name.replace(/[^a-zA-Z0-9]/g, '')}`;

        // Middleware
        node.middleware?.forEach((mw: any, idx: number) => {
            const id = makeId('mw', parentId, idx, mw.name);
            mw.id = id; // Assign to registry object for frontend
            if (mw._fn) (mw._fn as any)._debugId = id; // Assign to function for runtime tracking
        });

        // Controllers
        node.controllers?.forEach((ctrl: any, idx: number) => {
            const id = makeId('ctrl', parentId, idx, ctrl.name);
            ctrl.id = id;
            // Controllers don't have a single function. Attributes are on routes.
            // But we can store metadata if needed.
        });

        // Routes (in this node/router/controller)
        node.routes?.forEach((r: any, idx: number) => {
            // Route ID: logic?
            // Frontend doesn't explicitly ID route nodes unless they are loose.
            // But we need to track them.
            const id = makeId('route', parentId, idx, r.handlerName || 'handler');
            r.id = id;
            if (r._fn) (r._fn as any)._debugId = id;
        });

        // Child Routers
        node.routers?.forEach((r: any, idx: number) => {
            const id = makeId('router', parentId, idx, r.path);
            r.id = id;
            // Does router have a function? wrappedHandler?
            // Routers are containers mainly.
            this.assignIdsToRegistry(r.children, id);
        });

        // Events
        node.events?.forEach((e: any, idx: number) => {
            const id = makeId('event', parentId, idx, e.name);
            e.id = id;
            if (e._fn) (e._fn as any)._debugId = id;
        });
    }

    public recordNodeMetric(id: string, type: string, duration: number, isError: boolean) {
        if (!this.metrics.nodeMetrics[id]) {
            this.metrics.nodeMetrics[id] = {
                id,
                type,
                requests: 0,
                totalTime: 0,
                failures: 0,
                name: id // simplify
            };
        }
        const m = this.metrics.nodeMetrics[id];
        m.requests++;
        m.totalTime += duration;
        if (isError) m.failures++;
    }

    public recordEdgeMetric(from: string, to: string) {
        const key = `${from}|${to}`;
        this.metrics.edgeMetrics[key] = (this.metrics.edgeMetrics[key] || 0) + 1;
    }

    private getLinkPattern(): string {
        return getEditorLinkPattern();
    }

    public getHooks(): ShokupanHooks {
        return {
            onRequestStart: (ctx) => {
                if (ctx.path.startsWith(this.mountPath)) return;

                const app = (this as any)[$appRoot];
                if (!this.instrumented && app) {
                    this.instrumentApp(app);
                }

                this.metrics.totalRequests++; // Starts at 0
                this.metrics.activeRequests++; // INCREMENTS
                (ctx as any)._startTime = performance.now();
                (ctx as any)._reqStartTime = Date.now();

                // Capture IP early while request is fresh
                let cachedRemoteIP = (ctx as any).ip || ctx.request.headers.get('x-forwarded-for') || (ctx.req as any)?.socket?.remoteAddress;
                // Fallback for Bun
                if (!cachedRemoteIP && typeof (globalThis as any).Bun !== 'undefined' && (ctx.app as any).server) {
                    try {
                        cachedRemoteIP = (ctx.app as any).server.requestIP(ctx.req);
                    } catch {
                        // requestIP fails for internal requests (ShokupanRequest objects)
                        // This is expected for replayed/internal requests
                    }
                }
                if (cachedRemoteIP && typeof cachedRemoteIP === 'object') {
                    cachedRemoteIP = cachedRemoteIP.address;
                }
                (ctx as any)._cachedRemoteIP = cachedRemoteIP;

                // Initialize WebSocket tracking storage early
                if ((ctx.app as any).applicationConfig.enableWebSocketTracking) {
                    (ctx as any)[$wsMessages] = [];
                }

                // Attach Collector
                ctx[$debug] = new Collector(this);

                // Broadcast immediate update for active requests? 
                // Maybe throttle this if high load, but for now direct update is fine for lower loads.
                // Throttling:
                if (!this.broadcastTimer) {
                    this.broadcastTimer = setTimeout(() => {
                        this.broadcastMetrics();
                        this.broadcastTimer = undefined;
                    }, 100);
                }
            },

            onResponseEnd: async (ctx: any, response: any) => {
                await this[$appRoot].dbPromise;

                // Ignore dashboard requests to prevent noise and loops
                if (ctx.path.startsWith(this.mountPath)) return;

                this.metrics.activeRequests = Math.max(0, this.metrics.activeRequests - 1);
                const duration = (performance.now() - (ctx as any)._startTime) || 0;

                // Handle WebSocket upgrade or missing response
                if (!response) {
                    if (ctx.isUpgraded) {
                        // WebSocket upgrade success, we can log it as 101 or skip
                        // Let's create a dummy response object for logging purposes
                        response = {
                            status: 101,
                            headers: {}
                        };
                    } else {
                        // Unknown case, skip
                        return;
                    }
                }


                // Check ignore options
                const checkLog = {
                    method: ctx.method,
                    url: ctx.url.toString(),
                    path: ctx.path,
                    status: response.status
                } as RequestLog;

                if (this.shouldIgnoreRequest(checkLog)) return;

                // Record in MetricsCollector
                const isError = response.status >= 400;
                this.metricsCollector.recordRequest(duration, isError);
                this.updateTiming(duration);

                // Broadcast updates immediately
                if (!this.broadcastTimer) {
                    this.broadcastTimer = setTimeout(() => {
                        this.broadcastMetrics();
                        this.broadcastTimer = undefined;
                    }, 100);
                }

                const urlObj = new URL(ctx.url.toString());
                const cookieHeader = ctx.request.headers.get('cookie') || '';
                const cookiesCount = cookieHeader ? cookieHeader.split(';').length : 0;

                const headers: Record<string, string> = {};
                if (ctx.request.headers && typeof ctx.request.headers.forEach === 'function') {
                    ctx.request.headers.forEach((v: string, k: string) => {
                        headers[k] = v;
                    });
                }
                const resHeaders: Record<string, string> = {};
                if (response.headers && typeof response.headers.forEach === 'function') {
                    response.headers.forEach((v: string, k: string) => {
                        resHeaders[k] = v;
                    });
                }

                const responseHeadersSize = Object.entries(resHeaders).reduce((acc, [k, v]) => acc + k.length + String(v).length + 2, 0);

                let body = (ctx as any).responseBody;

                // If body is missing (manual response), try to capture it
                if (!body && response instanceof Response && response.body && !response.bodyUsed) {
                    try {
                        const clone = response.clone();
                        const contentType = response.headers.get('content-type') || '';
                        const contentEncoding = response.headers.get('content-encoding') || '';

                        // Expand detection for common static file types
                        const isTextLike = contentType.includes('json') ||
                            contentType.includes('text') ||
                            contentType.includes('xml') ||
                            contentType.includes('html') ||
                            contentType.includes('javascript') ||
                            contentType.includes('css') ||
                            contentType.includes('svg');

                        const isCompressed = contentEncoding && contentEncoding !== 'identity';

                        if (contentType.includes('json') && !isCompressed) {
                            body = await clone.json();
                        } else if (isTextLike && !isCompressed) {
                            body = await clone.text();
                        } else {
                            body = await clone.arrayBuffer();
                        }
                    } catch (e) {
                        // Ignore body capture errors
                    }
                }

                const contentLength = response.headers.get('content-length');
                const responseSize = (contentLength ? parseInt(contentLength, 10) : 0) || (body
                    ? (typeof body === 'string' ? body.length : (body instanceof ArrayBuffer || body instanceof Uint8Array ? body.byteLength : 0))
                    : 0);

                // Try to get remote IP from various headers or socket, or use cached value
                let remoteIP = (ctx as any)._cachedRemoteIP || (ctx as any).ip || ctx.request.headers.get('x-forwarded-for') || (ctx.req as any)?.socket?.remoteAddress;

                // Fallback for Bun
                if (!remoteIP && typeof (globalThis as any).Bun !== 'undefined' && (ctx.app as any).server) {
                    remoteIP = (ctx.app as any).server.requestIP(ctx.req);
                }

                if (remoteIP && typeof remoteIP === 'object') {
                    remoteIP = remoteIP.address;
                }

                if (response.status >= 400) {
                    this.metrics.failedRequests++;
                    if (response.status === 429) {
                        const path = ctx.path;
                        this.metrics.rateLimitedCounts[path] = (this.metrics.rateLimitedCounts[path] || 0) + 1;
                    }

                    // Record failure in failed_request table for aggregate tracking
                    try {
                        const id = `failed_${ctx.requestId}`;
                        await this.db.upsert('failed_request', id, {
                            id,
                            method: ctx.method,
                            url: ctx.url.toString(),
                            headers, // Re-use already extracted headers
                            status: response.status,
                            timestamp: Date.now(),
                            state: ctx.state,
                            responseHeaders: resHeaders,
                            hasRequestBody: !!(ctx.requestBody || (ctx as any).bodyData),
                            hasResponseBody: !!body
                        });
                    } catch (e) {
                        this[$appRoot].logger?.error('Dashboard', 'Failed to record failed request summary', e);
                    }
                } else {
                    this.metrics.successfulRequests++;
                }

                // Detect chunked or streamed responses
                const transferEncoding = resHeaders['transfer-encoding'] || resHeaders['Transfer-Encoding'];
                const isChunked = transferEncoding?.includes('chunked') || false;
                const contentType = resHeaders['content-type'] || resHeaders['Content-Type'] || '';
                const isStreamed = contentType.includes('stream') || contentType.includes('event-stream') || false;

                // Calculate metadata for log entry
                const logEntry: RequestLog = {
                    method: response.status === 101 ? 'WS' : ctx.method,
                    url: ctx.url.toString(),
                    status: response.status,
                    duration,
                    timestamp: (ctx as any)._reqStartTime || (Date.now() - duration),
                    handlerStack: this.serializeHandlerStack((ctx as any).handlerStack),
                    contentType: resHeaders['content-type'] || resHeaders['Content-Type'],
                    type: response.status === 101 ? 'ws' : 'inbound',
                    direction: 'inbound',
                    size: responseSize,
                    protocol: (ctx.req as any)?.httpVersion,
                    domain: urlObj.hostname,
                    path: urlObj.pathname,
                    scheme: urlObj.protocol.replace(':', ''),
                    cookies: cookiesCount,
                    transferred: responseSize + responseHeadersSize,
                    remoteIP,
                    requestHeaders: headers,
                    responseHeaders: resHeaders,
                    wsMessages: (ctx as any)[$wsMessages],
                    hasRequestBody: !!(ctx.requestBody || (ctx as any).bodyData),
                    hasResponseBody: !!body,
                    isChunked,
                    isStreamed,
                    chunkTimings: (ctx as any)._chunkTimings || undefined
                };

                const requestId = ctx.requestId;

                if ((ctx.app as any).applicationConfig.enableWebSocketTracking) {
                    // Attach listener for live updates
                    let updateTimer: any;
                    (ctx as any)[$onWsMessage] = (msg: any) => {
                        if (!logEntry.wsMessages) {
                            logEntry.wsMessages = (ctx as any)[$wsMessages];
                        }
                        logEntry.duration = Date.now() - logEntry.timestamp;

                        if (updateTimer) return;
                        updateTimer = setTimeout(() => {
                            updateTimer = null;
                            this.db.upsert('request', requestId, { ...logEntry, id: requestId }).catch(() => { });
                            this.broadcastRequestUpdates([{ ...logEntry, id: requestId }]);
                        }, 100);
                    };
                }

                const requestData = { id: requestId, ...logEntry };
                this.metrics.logs.push(requestData as any);

                // Persist to datastore
                if (this.db) {
                    this.db.create('request', requestId, { ...requestData, direction: "inbound" }).catch(e => {
                        this[$appRoot]?.logger?.error('Dashboard', "Failed to record request log", { error: e });
                    });

                    // Save payloads separately - unified ID handling (no failed_ prefix for payloads)
                    const reqBody = ctx.requestBody || (ctx as any).bodyData;
                    if (reqBody) {
                        const payloadId = `${requestId}:request`;
                        this.db.upsert('payload', payloadId, { data: this.serializeBody(reqBody, false) }).catch(() => { });
                    }
                    if (body) {
                        const payloadId = `${requestId}:response`;
                        this.db.upsert('payload', payloadId, { data: this.serializeBody(body, false) }).catch(() => { });
                    }
                }
                const retention = this.dashboardConfig.retentionMs ?? 7200000;
                const cutoff = Date.now() - retention;
                if (this.metrics.logs.length > 0 && this.metrics.logs[0].timestamp < cutoff) {
                    this.metrics.logs = this.metrics.logs.filter(log => log.timestamp >= cutoff);
                }

                const strategy = this.dashboardConfig.updateStrategy || 'immediate';

                if (strategy === 'immediate') {
                    if (logEntry.method === 'WS' || response.status === 101) {
                        this[$appRoot]?.logger?.debug('Dashboard', 'Broadcasting WS Data:', requestData);
                    }
                    this.broadcastRequestUpdates([requestData]);
                } else {
                    // Buffer request for WS push
                    this.requestsBuffer.push(requestData);
                }
            }
        };
    }

    private startRequestPushTimer() {
        const interval = this.dashboardConfig.updateInterval || 10000;
        this.requestPushTimer = setInterval(() => {
            if (this.requestsBuffer.length > 0) {
                this.broadcastRequestUpdates();
            }
        }, interval);
    }

    private broadcastRequestUpdates(requestsOverride?: any[]) {
        if (this.clients.size === 0) {
            if (!requestsOverride) this.requestsBuffer = [];
            return;
        }

        let requests;
        if (requestsOverride) {
            requests = requestsOverride;
        } else {
            requests = [...this.requestsBuffer];
            this.requestsBuffer = []; // Clear buffer
        }

        if (requests.length === 0) return;

        // Debug log
        this[$appRoot]?.logger?.debug('Dashboard', `Broadcasting ${requests.length} requests. Sample ID: ${requests[0].id}`);

        const data = JSON.stringify({
            type: 'requests-update',
            requests
        });

        for (const client of this.clients) {
            if (client?.send) {
                client.send(data);
            }
        }
    }

    private updateTiming(duration: number) {
        const alpha = 0.1;
        if (this.metrics.averageTotalTime_ms === 0) {
            this.metrics.averageTotalTime_ms = duration;
        } else {
            this.metrics.averageTotalTime_ms = (alpha * duration) + ((1 - alpha) * this.metrics.averageTotalTime_ms);
        }
        this.metrics.recentTimings.push(duration);
        if (this.metrics.recentTimings.length > 50) {
            this.metrics.recentTimings.shift();
        }
    }
    private serializeHandlerStack(stack: any[]): any[] {
        if (!stack || !Array.isArray(stack)) return [];
        return stack.map(item => ({
            name: item.name,
            file: item.file,
            line: item.line,
            duration: item.duration,
            startTime: item.startTime,
            isBuiltin: item.isBuiltin,
            stateChanges: item.stateChanges
        }));
    }

    private serializeBody(body: any, truncate = true): any {
        if (!body) return undefined;

        // Handle strings
        if (typeof body === 'string') {
            if (truncate && body.length > 524288) {
                return body.substring(0, 524288) + '... (truncated)';
            }
            return body;
        }

        // Handle objects (JSON)
        if (typeof body === 'object' && !(body instanceof ArrayBuffer) && !(body instanceof Uint8Array)) {
            try {
                if (truncate) {
                    const str = JSON.stringify(body);
                    if (str.length > 524288) {
                        return str.substring(0, 524288) + '... (truncated)';
                    }
                }
                return body;
            } catch (e) {
                return '[Circular or Non-Serializable Body]';
            }
        }

        // Handle binary/buffers (common for static files)
        if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
            const buffer = body instanceof Uint8Array ? body : new Uint8Array(body);
            if (buffer.length === 0) return undefined;

            // For now, let's keep the UTF-8 check, but if it fails, return as base64 object
            if (buffer.length < 1024 * 1024) {
                try {
                    const decoder = new TextDecoder('utf-8', { fatal: true });
                    const text = decoder.decode(buffer);
                    if (truncate && text.length > 524288) {
                        return text.substring(0, 524288) + '... (truncated)';
                    }
                    return text;
                } catch (e) {
                }
            }

            // Return as a special object that the browser can recognize
            const limit = truncate ? 1024 * 1024 : 500 * 1024 * 1024; // 1MB limit for logs, 500MB for payloads
            if (buffer.length > limit) {
                return `[Binary Data: ${buffer.length} bytes (too large)]`;
            }

            return {
                __binary: true,
                data: Buffer.from(buffer).toString('base64'),
                length: buffer.length
            };
        }

        return '[Binary or Unreadable Body]';
    }

    /**
     * Validates a URL for the replay endpoint to prevent SSRF attacks.
     * Returns an object with an `error` property if the URL is unsafe.
     */
    public static validateReplayUrl(url: string, mountPath: string, allowedReplayHosts?: string[] | ((hostname: string) => boolean)): { error?: string } {
        try {
            const urlObj = new URL(url);
            const blockedProtocols = ['file:', 'ftp:', 'gopher:', 'data:', 'javascript:', 'vbscript:'];
            if (blockedProtocols.includes(urlObj.protocol)) {
                return { error: 'Invalid protocol' };
            }
            const hostname = urlObj.hostname;

            // Check custom allowlist first
            if (allowedReplayHosts) {
                if (typeof allowedReplayHosts === 'function') {
                    if (!allowedReplayHosts(hostname)) {
                        return { error: 'Hostname not allowed' };
                    }
                } else {
                    const isAllowed = allowedReplayHosts.some(pattern => matchHostGlob(pattern, hostname));
                    if (!isAllowed) {
                        return { error: 'Hostname not allowed' };
                    }
                }
            } else {
                // Default private IP blocking
                const isPrivateIP = hostname === 'localhost' || hostname === '127.0.0.1' ||
                    hostname.startsWith('10.') || hostname.startsWith('192.168.') ||
                    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
                if (isPrivateIP) {
                    return { error: 'Cannot replay to internal addresses' };
                }
            }

            if (urlObj.pathname.startsWith(mountPath)) {
                return { error: 'Cannot replay to dashboard path' };
            }
            return {};
        } catch {
            return { error: 'Invalid URL' };
        }
    }
}
function unknownError(ctx: any): any {
    return ctx.json({ error: "Unknown Error" }, 500);
}

export default function DebugDashboard(config?: DashboardConfig) {
    return new Dashboard(config);
}
