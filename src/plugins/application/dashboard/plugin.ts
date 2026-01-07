import { Eta } from "eta";
import { readFile } from 'node:fs/promises';
import type { DebugCollector, ShokupanContext } from "../../../context";
import { ShokupanRouter } from "../../../router";
import { datastore } from "../../../util/datastore";
import { $appRoot } from "../../../util/symbol";
import type { ShokupanHooks } from "../../../util/types";

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
    /**
     * Function to get request headers to include in the debug dashboard
     */
    getHeaders?: (ctx: ShokupanContext) => Record<string, string>;
    /**
     * Retention time in milliseconds
     */
    retentionMs?: number;
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

export class Dashboard extends ShokupanRouter {
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
        views: __dirname + "/static",
        cache: false
    });
    private startTime = Date.now();
    private instrumented = false;

    constructor(private readonly dashboardConfig: DashboardConfig = {}) {
        super();

        this.get("/metrics", (ctx) => {
            const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            const uptime = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;

            return ctx.json({
                metrics: this.metrics,
                uptime
            });
        });

        this.get("/registry", (ctx) => {
            const app = (this)[$appRoot];
            if (!this.instrumented && app) {
                this.instrumentApp(app);
            }
            const registry = app?.getComponentRegistry?.();
            if (registry) {
                this.assignIdsToRegistry(registry, 'root');
            }
            return ctx.json({ registry });
        });

        // Requests Listing Endpoint
        this.get("/requests", async (ctx) => {
            const result = await datastore.query("SELECT * FROM requests ORDER BY timestamp DESC LIMIT 100");
            return ctx.json({ requests: result[0] || [] });
        });

        // Request Details Endpoint
        this.get("/requests/:id", async (ctx) => {
            const result = await datastore.query("SELECT * FROM requests WHERE id = $id", { id: ctx.params['id'] });
            return ctx.json({ request: result[0]?.[0] });
        });

        // Replay/Failed Requests Endpoints
        this.get("/failures", async (ctx) => {
            const result = await datastore.query("SELECT * FROM failed_requests ORDER BY timestamp DESC LIMIT 50");
            return ctx.json({ failures: result[0] });
        });

        this.post("/replay", async (ctx) => {
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

        this.get("/", async (ctx) => {
            const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            const uptime = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;

            const linkPattern = this.getLinkPattern();
            const template = await readFile(__dirname + "/template.eta", 'utf8');

            return ctx.html(this.eta.renderString(template, {
                metrics: this.metrics,
                uptime,
                rootPath: process.cwd(),
                linkPattern,
                headers: this.dashboardConfig.getHeaders?.(ctx)
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
            delete mw._fn; // Clean up
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
            delete r._fn;
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
                ctx._debug = new Collector(this);
            },

            onResponseEnd: async (ctx, response) => {
                this.metrics.activeRequests = Math.max(0, this.metrics.activeRequests - 1);
                const start = (ctx as any)._debugStartTime;
                let duration = 0;
                if (start) {
                    duration = performance.now() - start;
                    this.updateTiming(duration);
                }

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

                        await datastore.set('failed_requests', Date.now().toString(), {
                            method: ctx.request.method,
                            url: ctx.path || ctx.request.url,
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
                    method: ctx.request.method,
                    url: ctx.path,
                    status: response.status,
                    duration,
                    timestamp: Date.now(),
                    handlerStack: (ctx as any).handlerStack
                };

                this.metrics.logs.push(logEntry);

                // Persist to datastore for detailed view
                try {
                    await datastore.set('requests', Date.now().toString(), logEntry);
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
