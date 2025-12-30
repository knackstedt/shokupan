import { Eta } from "eta";
import { ShokupanRouter } from "../../router";
import type { ShokupanHooks } from "../../types";

interface RequestMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    activeRequests: number;

    // Timing averages (in milliseconds)
    averageTotalTime_ms: number;

    // Store last N timings for moving average/display
    recentTimings: number[];

    // Request logs
    logs: RequestLog[];
}

export interface RequestLog {
    method: string;
    url: string;
    status: number;
    duration: number;
    timestamp: number;
}




export interface DebugDashboardConfig {
    /**
     * Function to generate headers for the dashboard fetch requests.
     * This function will be serialized and executed in the browser.
     */
    getRequestHeaders?: () => Record<string, string>;

    /**
     * How long to keep request logs in milliseconds.
     * @default 7200000 (2 hours)
     */
    retentionMs?: number;
}

export class DebugDashboard extends ShokupanRouter {
    private metrics: RequestMetrics = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        activeRequests: 0,
        averageTotalTime_ms: 0,
        recentTimings: [],
        logs: []
    };

    private eta = new Eta();
    private startTime = Date.now();

    constructor(private readonly dashboardConfig: DebugDashboardConfig = {}) {
        super();

        // Serve the metrics as JSON
        this.get("/metrics", (ctx) => {
            const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            const uptime = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;

            return ctx.json({
                metrics: this.metrics,
                uptime
            });
        });

        // Serve the dashboard
        this.get("/", async (ctx) => {
            const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            const uptime = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`;

            const template = await Bun.file(__dirname + "/template.eta").text();
            const html = this.eta.renderString(template, {
                metrics: this.metrics,
                uptime,
                // Serialize the function to string if it exists
                getRequestHeaders: this.dashboardConfig.getRequestHeaders?.toString()
            });
            return ctx.html(html);
        });
    }

    /**
     * Returns the hooks needed to collect metrics using Shokupan's lifecycle events.
     * Add this spread to your application hooks.
     */
    public getHooks(): ShokupanHooks {
        return {
            onRequestStart: (ctx) => {
                this.metrics.totalRequests++;
                this.metrics.activeRequests++;
                // Mark start time for this specific request on the context
                (ctx as any)._debugStartTime = performance.now();
            },

            onRequestEnd: (ctx) => {
                // Called when processing is done but before response is sent? 
                // Actually onResponseEnd is better for full timing including serialization
            },

            onResponseEnd: (ctx, response) => {
                this.metrics.activeRequests = Math.max(0, this.metrics.activeRequests - 1);

                const start = (ctx as any)._debugStartTime;
                let duration = 0;
                if (start) {
                    duration = performance.now() - start;
                    this.updateTiming(duration);
                }

                if (response.status >= 400) {
                    this.metrics.failedRequests++;
                } else {
                    this.metrics.successfulRequests++;
                }

                // Add log entry
                this.metrics.logs.push({
                    method: ctx.request.method,
                    url: ctx.path,
                    status: response.status,
                    duration,
                    timestamp: Date.now()
                });

                // Apply retention policy
                const retention = this.dashboardConfig.retentionMs ?? 7200000;
                const cutoff = Date.now() - retention;

                // Optimized removal from start only if needed (assuming roughly chronological order)
                if (this.metrics.logs.length > 0 && this.metrics.logs[0].timestamp < cutoff) {
                    this.metrics.logs = this.metrics.logs.filter(log => log.timestamp >= cutoff);
                }
            },

            onError: (err, ctx) => {
                // If error hook is called, it usually results in a 500 response handled by Shokupan
                // So onResponseEnd will likely pick it up as a failure (status 500)
                // We don't double count here, but we could log specific error types if we wanted.
            }
        };
    }

    private updateTiming(duration: number) {
        // Simple moving average
        const alpha = 0.1; // Weight for new value
        if (this.metrics.averageTotalTime_ms === 0) {
            this.metrics.averageTotalTime_ms = duration;
        } else {
            this.metrics.averageTotalTime_ms = (alpha * duration) + ((1 - alpha) * this.metrics.averageTotalTime_ms);
        }

        // Keep recent timings for potential charts later
        this.metrics.recentTimings.push(duration);
        if (this.metrics.recentTimings.length > 50) {
            this.metrics.recentTimings.shift();
        }
    }
}
