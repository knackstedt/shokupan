import type { HeadersInit } from 'bun';
import { Eta } from "eta";
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RecordId } from 'surrealdb';
import type { DebugCollector } from "../../../context";
import { ShokupanRouter } from "../../../router";
import type { Shokupan } from '../../../shokupan';
import { $appRoot, $childRouters, $debug, $mountPath } from "../../../util/symbol";
import type { ShokupanHooks, ShokupanPlugin } from "../../../util/types";
import { MetricsCollector } from './metrics-collector';

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
}

export interface DashboardConfig {
    getRequestHeaders?: () => HeadersInit;
    path?: string;
    /**
     * Retention time in milliseconds
     */
    retentionMs?: number;
    integrations?: {
        scalar?: boolean | { path?: string; };
        asyncapi?: boolean | { path?: string; };
    };
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

export class Dashboard implements ShokupanPlugin {

    private [$appRoot]: Shokupan;

    private router = new ShokupanRouter();
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

    private eta = new Eta({
        views: Dashboard.getBasePath() + "/static",
        cache: false
    });
    private startTime = Date.now();
    private instrumented = false;
    private metricsCollector: MetricsCollector;
    get db() {
        return this[$appRoot].db;
    }

    constructor(private readonly dashboardConfig: DashboardConfig = {}) { }

    // ShokupanPlugin interface implementation
    public onInit(app: any, options?: { path?: string; }) {
        this[$appRoot] = app;
        this.metricsCollector = new MetricsCollector(this.db);

        const mountPath = options?.path || this.dashboardConfig.path || '/dashboard';

        // Register hooks on the app to track all requests
        const hooks = this.getHooks();
        if (!app.middleware) {
            app.middleware = [];
        }

        // Create middleware that wraps the hooks
        const hooksMiddleware = async (ctx: any, next: any) => {
            if (hooks.onRequestStart) {
                await hooks.onRequestStart(ctx);
            }

            const startTime = Date.now();
            await next();
            const duration = Date.now() - startTime;

            if (hooks.onResponseEnd) {
                // Use _finalResponse if available to get the actual status code sent to the client
                const effectiveResponse = (ctx as any)._finalResponse || ctx.response || {};
                await hooks.onResponseEnd(ctx, effectiveResponse);
            }
        };

        app.use(hooksMiddleware);

        // Mount the dashboard router
        app.mount(mountPath, this.router);

        // Set up all routes on the internal router
        this.setupRoutes();
    }

    private detectIntegrations() {
        const integrations: Record<string, string | undefined> = {};
        const routers = this[$appRoot]?.[$childRouters] || [];
        // Helper to check config
        const checkConfig = (key: 'scalar' | 'asyncapi') => {
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
                const plugin = routers.find(r => r.constructor.name === 'ScalarPlugin');
                if (plugin) {
                    integrations['scalar'] = (plugin as any)[$mountPath];
                }
            }
        }

        // AsyncAPI
        const asyncApiConf = checkConfig('asyncapi');
        if (asyncApiConf.enabled) {
            if (asyncApiConf.path) {
                integrations['asyncapi'] = asyncApiConf.path;
            } else {
                const plugin = routers.find(r => r.constructor.name === 'AsyncApiPlugin');
                if (plugin) {
                    integrations['asyncapi'] = (plugin as any)[$mountPath];
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
        this.router.get("/metrics", async (ctx) => {
            const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            const uptime = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;

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

                // For accuracy, query the requests table for the specific window
                let stats;
                try {
                    stats = await this.db.query(`
                        SELECT 
                            count() as total,
                            count(IF status < 400 THEN 1 END) as success,
                            count(IF status >= 400 THEN 1 END) as failed,
                            math::mean(duration) as avg_latency
                        FROM requests 
                        WHERE timestamp >= $start
                        GROUP ALL
                    `, { start: startTime });
                } catch (error) {
                    console.error('[Dashboard] Query failed at plugin.ts:180-191', {
                        error,
                        interval,
                        startTime,
                        query: 'metrics interval stats',
                        stack: new Error().stack
                    });
                    throw error;
                }

                const s = stats[0] || { total: 0, success: 0, failed: 0, avg_latency: 0 };
                // console.log("INTERVAL STATS:", interval, s);

                return ctx.json({
                    metrics: {
                        totalRequests: s.total || 0,
                        successfulRequests: s.success || 0,
                        failedRequests: s.failed || 0,
                        activeRequests: this.metrics.activeRequests,
                        averageTotalTime_ms: s.avg_latency || 0,
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
            const interval = ctx.query['interval'] || '1m';

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
            // Expand window to 3x the requested period to ensure we catch the aligned start points.
            const startTime = Date.now() - (periodMs * 3);
            const endTime = Date.now();

            const result = await this.db.query(
                "SELECT * FROM metrics WHERE timestamp >= $start AND timestamp <= $end AND interval = $interval ORDER BY timestamp ASC",
                { start: startTime, end: endTime, interval }
            );

            return ctx.json({
                metrics: result[0] || [],
            });
        });

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
            const result = await this.db.query(
                "SELECT method, url, count() as count FROM requests WHERE timestamp >= $start GROUP BY method, url ORDER BY count DESC LIMIT 10",
                { start: startTime }
            );
            return ctx.json({ top: result[0] || [] });
        });

        // Top Errors Endpoint
        this.router.get("/errors/top", async (ctx) => {
            const startTime = getIntervalStartTime(ctx.query['interval']);
            const result = await this.db.query(
                "SELECT status, count() as count FROM failed_requests WHERE timestamp >= $start GROUP BY status ORDER BY count DESC LIMIT 10",
                { start: startTime }
            );
            return ctx.json({ top: result[0] || [] });
        });

        // Failing Requests Endpoint
        this.router.get("/requests/failing", async (ctx) => {
            const startTime = getIntervalStartTime(ctx.query['interval']);
            const result = await this.db.query(
                "SELECT method, url, count() as count FROM failed_requests WHERE timestamp >= $start GROUP BY method, url ORDER BY count DESC LIMIT 10",
                { start: startTime }
            );
            return ctx.json({ top: result[0] || [] });
        });

        // Slowest Requests Endpoint
        this.router.get("/requests/slowest", async (ctx) => {
            const startTime = getIntervalStartTime(ctx.query['interval']);
            const result = await this.db.query(
                "SELECT method, url, duration, status, timestamp FROM requests WHERE timestamp >= $start ORDER BY duration DESC LIMIT 10",
                { start: startTime }
            );
            return ctx.json({ slowest: result[0] || [] });
        });

        this.router.get("/registry", (ctx) => {
            const app = this[$appRoot];
            if (!this.instrumented && app) {
                this.instrumentApp(app);
            }
            const registry = app?.getComponentRegistry?.();
            if (registry) {
                this.assignIdsToRegistry(registry, 'root');
            }
            return ctx.json({ registry: registry || {} });
        });

        // Requests Listing Endpoint
        this.router.get("/requests", async (ctx) => {
            const result = await this.db.query("SELECT * FROM requests ORDER BY timestamp DESC LIMIT 100");
            return ctx.json({ requests: result[0] || [] });
        });

        // Request Details Endpoint
        this.router.get("/requests/:id", async (ctx) => {
            const result = await this.db.query("SELECT * FROM requests WHERE id = $id", { id: ctx.params['id'] });
            return ctx.json({ request: result[0]?.[0] });
        });

        // Replay/Failed Requests Endpoints
        this.router.get("/failures", async (ctx) => {
            const result = await this.db.query("SELECT * FROM failed_requests ORDER BY timestamp DESC LIMIT 50");
            return ctx.json({ failures: result[0] });
        });

        this.router.post("/replay", async (ctx) => {
            const body = await ctx.body();
            // Logic to replay request:
            // We can't easily replay against the running server instance from inside without a loopback fetch.
            // We can use Shokupan.processRequest if we have access to app.
            const app = (this as any)[$appRoot];
            if (!app) return unknownError(ctx);

            // Construct request
            try {
                // body should contain method, url, headers, body
                const result = await app.processRequest({
                    method: body.method,
                    path: body.url, // or path
                    headers: body.headers,
                    body: body.body
                });
                return ctx.json({
                    status: result.status,
                    headers: result.headers,
                    data: result.data
                });
            } catch (e) {
                return ctx.json({ error: String(e) }, 500);
            }
        });

        this.router.get("/", async (ctx) => {
            const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            const uptime = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;

            const linkPattern = this.getLinkPattern();
            const template = await readFile(Dashboard.getBasePath() + "/template.eta", 'utf8');

            const integrations = this.detectIntegrations();

            return ctx.html(this.eta.renderString(template, {
                metrics: this.metrics,
                uptime,
                rootPath: process.cwd(),
                linkPattern,
                integrations,
                headers: this.dashboardConfig.getRequestHeaders?.()
            }));
        });
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
        const term = process.env['TERM_PROGRAM'] || '';
        if (['vscode', 'cursor', 'antigravity'].some(t => term.includes(t))) {
            return 'vscode://file/{{absolute}}:{{line}}';
        }
        return 'file:///{{absolute}}:{{line}}';
    }

    public getHooks(): ShokupanHooks {
        return {
            onRequestStart: (ctx) => {
                const app = (this as any)[$appRoot];
                if (!this.instrumented && app) {
                    this.instrumentApp(app);
                }

                this.metrics.totalRequests++;
                this.metrics.activeRequests++;
                (ctx as any)._debugStartTime = performance.now();

                // Attach Collector
                ctx[$debug] = new Collector(this);
            },

            onResponseEnd: async (ctx, response) => {
                this.metrics.activeRequests = Math.max(0, this.metrics.activeRequests - 1);
                const start = (ctx as any)._debugStartTime;
                let duration = 0;
                if (start) {
                    duration = performance.now() - start;
                    this.updateTiming(duration);
                }

                // Record in MetricsCollector
                const isError = response.status >= 400;
                this.metricsCollector.recordRequest(duration, isError);

                if (response.status >= 400) {
                    this.metrics.failedRequests++;
                    if (response.status === 429) {
                        const path = ctx.path;
                        this.metrics.rateLimitedCounts[path] = (this.metrics.rateLimitedCounts[path] || 0) + 1;
                    }

                    // Record failure in Datastore
                    try {
                        const headers: Record<string, string> = {};
                        if (ctx.request.headers && typeof ctx.request.headers.forEach === 'function') {
                            ctx.request.headers.forEach((v: string, k: string) => {
                                headers[k] = v;
                            });
                        }

                        await this.db.upsert(new RecordId('failed_requests', ctx.requestId), {
                            method: ctx.method,
                            url: ctx.url.toString(),
                            headers: headers,
                            status: response.status,
                            timestamp: Date.now(),
                            state: ctx.state,
                            // body?
                        });
                    } catch (e) {
                        console.error("Failed to record failed request", e);
                    }

                } else {
                    this.metrics.successfulRequests++;
                }

                const logEntry: RequestLog = {
                    method: ctx.method,
                    url: ctx.url.toString(),
                    status: response.status,
                    duration,
                    timestamp: Date.now(),
                    handlerStack: (ctx as any).handlerStack
                };

                this.metrics.logs.push(logEntry);

                // Persist to datastore for detailed view
                try {
                    await this.db.upsert(new RecordId('requests', ctx.requestId), logEntry);
                } catch (e) {
                    console.error("Failed to record request log", e);
                }

                const retention = this.dashboardConfig.retentionMs ?? 7200000;
                const cutoff = Date.now() - retention;
                if (this.metrics.logs.length > 0 && this.metrics.logs[0].timestamp < cutoff) {
                    this.metrics.logs = this.metrics.logs.filter(log => log.timestamp >= cutoff);
                }
            }
        };
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
}
function unknownError(ctx: any): any {
    return ctx.json({ error: "Unknown Error" }, 500);
}

export default function DebugDashboard(config?: DashboardConfig) {
    return new Dashboard(config);
}
