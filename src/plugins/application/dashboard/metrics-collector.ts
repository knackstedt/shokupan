import * as os from 'node:os';
// import { monitorEventLoopDelay } from 'node:perf_hooks'; // Disabled for stability
import type { DatastoreAdapter } from '../../../util/adapter/datastore';
import type { Logger } from '../../../util/logger';

interface AggregatedMetric {
    timestamp: number;
    interval: string;
    cpu: number;
    memory: {
        used: number;
        total: number;
        heapUsed: number;
        heapTotal: number;
    };
    load: number[];
    eventLoopLatency: {
        min: number;
        max: number;
        mean: number;
        p50: number;
        p95: number;
        p99: number;
    };
    requests: {
        total: number;
        rps: number;
        success: number;
        error: number;
    };
    responseTime: {
        min: number;
        max: number;
        avg: number;
        p50: number;
        p95: number;
        p99: number;
    };
}

const INTERVALS = [
    { label: '10s', ms: 10 * 1000 },
    { label: '1m', ms: 60 * 1000 },
    { label: '5m', ms: 5 * 60 * 1000 },
    { label: '1h', ms: 60 * 60 * 1000 },
    { label: '2h', ms: 2 * 60 * 60 * 1000 },
    { label: '6h', ms: 6 * 60 * 60 * 1000 },
    { label: '12h', ms: 12 * 60 * 60 * 1000 },
    { label: '1d', ms: 24 * 60 * 60 * 1000 },
    { label: '3d', ms: 3 * 24 * 60 * 60 * 1000 },
    { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
    { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
];

export class MetricsCollector {
    private currentIntervalStart: Record<string, number> = {};
    private pendingDetails: Record<string, { duration: number, isError: boolean; }[]> = {};
    // private eventLoopHistogram: any;
    private timer: NodeJS.Timeout | null = null;

    public db?: DatastoreAdapter;

    constructor(
        db?: DatastoreAdapter,
        private onCollect?: (metric: AggregatedMetric) => void,
        private logger?: Logger
    ) {
        this.db = db;
        // try {
        //     this.eventLoopHistogram = monitorEventLoopDelay({ resolution: 10 });
        //     this.eventLoopHistogram.enable();
        // } catch (e) {
        //     // Ignore if perf hooks fail
        //     this.logger?.warn('MetricsCollector', 'Failed to initialize event loop monitor', { error: e });
        // }

        // Initialize start times
        const now = Date.now();
        INTERVALS.forEach(int => {
            this.currentIntervalStart[int.label] = this.alignTimestamp(now, int.ms);
            this.pendingDetails[int.label] = [];
        });

        // Start collection loop
        this.startLoop();
    }

    private startLoop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            try {
                this.collect();
            } catch (e) {
                this.logger?.error('MetricsCollector', 'Critical error in collect loop', e);
            }
        }, 1000); // Check every second for better precision
    }

    public recordRequest(duration: number, isError: boolean) {
        INTERVALS.forEach(int => {
            if (!this.pendingDetails[int.label]) this.pendingDetails[int.label] = [];
            this.pendingDetails[int.label].push({ duration, isError });
        });
    }

    private alignTimestamp(ts: number, intervalMs: number): number {
        return Math.floor(ts / intervalMs) * intervalMs;
    }

    private async collect() {
        const now = Date.now();
        for (const int of INTERVALS) {
            let start = this.currentIntervalStart[int.label];
            // Initialize if missing
            if (!start) {
                start = this.alignTimestamp(now, int.ms);
                this.currentIntervalStart[int.label] = start;
                this.pendingDetails[int.label] = [];
            }

            if (now >= start + int.ms) {
                await this.flushInterval(int.label, start, int.ms);
                // Advance
                this.currentIntervalStart[int.label] = this.alignTimestamp(now, int.ms);
            }
        }
    }

    private async flushInterval(label: string, timestamp: number, durationMs: number) {
        const reqs = this.pendingDetails[label] || [];
        this.pendingDetails[label] = [];

        // Calculate metrics even if reqs is empty
        const totalReqs = reqs.length;
        const errorReqs = reqs.filter(r => r.isError).length;
        const successReqs = totalReqs - errorReqs;

        const duratons = reqs.map(r => r.duration).sort((a, b) => a - b);
        const rps = totalReqs / (durationMs / 1000);
        const sum = duratons.reduce((a, b) => a + b, 0);
        const avg = totalReqs > 0 ? sum / totalReqs : 0;

        const getP = (p: number) => {
            if (duratons.length === 0) return 0;
            const idx = Math.floor(duratons.length * p);
            return duratons[idx];
        };

        let eventLoopStats = { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
        // try {
        //     eventLoopStats = {
        //         min: this.eventLoopHistogram.min / 1e6,
        //         max: this.eventLoopHistogram.max / 1e6,
        //         mean: this.eventLoopHistogram.mean / 1e6,
        //         p50: this.eventLoopHistogram.percentile(50) / 1e6,
        //         p95: this.eventLoopHistogram.percentile(95) / 1e6,
        //         p99: this.eventLoopHistogram.percentile(99) / 1e6,
        //     };
        // } catch (e) { }

        const metric: AggregatedMetric = {
            timestamp,
            interval: label,
            cpu: os.loadavg()[0], // Using load avg for simplicity as per requirements (Load)
            load: os.loadavg(),
            memory: {
                used: process.memoryUsage().rss,
                total: os.totalmem(),
                heapUsed: process.memoryUsage().heapUsed,
                heapTotal: process.memoryUsage().heapTotal,
            },
            eventLoopLatency: eventLoopStats,
            requests: {
                total: totalReqs,
                rps,
                success: successReqs,
                error: errorReqs,
            },
            responseTime: {
                min: duratons[0] || 0,
                max: duratons[duratons.length - 1] || 0,
                avg,
                p50: getP(0.50),
                p95: getP(0.95),
                p99: getP(0.99),
            }
        };

        // Persist if DB available
        if (this.db) {
            try {
                await this.db.upsert('metrics', `${label}_${timestamp}`, metric);
            } catch (e) {
                // Silent fail or log
            }
        }

        // Always notify
        if (this.onCollect) {
            this.onCollect(metric);
        }
    }

    // Cleanup if needed
    public stop() {
        if (this.timer) clearInterval(this.timer);
        // try { this.eventLoopHistogram.disable(); } catch (e) { }
    }
}
