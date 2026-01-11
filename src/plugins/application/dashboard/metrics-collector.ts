
import * as os from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { RecordId } from 'surrealdb';
import type { SurrealDatastore } from '../../../util/datastore';

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
    private eventLoopHistogram = monitorEventLoopDelay({ resolution: 10 });
    private timer: NodeJS.Timeout | null = null;

    constructor(
        private readonly db: SurrealDatastore
    ) {
        this.eventLoopHistogram.enable();
        // Initialize start times
        const now = Date.now();
        INTERVALS.forEach(int => {
            this.currentIntervalStart[int.label] = this.alignTimestamp(now, int.ms);
            this.pendingDetails[int.label] = [];
        });

        // Start collection loop - tick every 10 seconds to process high-res intervals?
        // Actually, for 1m interval, we should tick at least every minute.
        // Let's tick every 10s to be safe and accurate enough.
        // this.timer = setInterval(() => this.collect(), 10000);
    }

    public recordRequest(duration: number, isError: boolean) {
        INTERVALS.forEach(int => {
            this.pendingDetails[int.label].push({ duration, isError });
        });
    }

    private alignTimestamp(ts: number, intervalMs: number): number {
        return Math.floor(ts / intervalMs) * intervalMs;
    }

    private async collect() {
        try {
            const now = Date.now();
            // console.log('[MetricsCollector] collect() called at', new Date(now).toISOString());

            for (const int of INTERVALS) {
                const start = this.currentIntervalStart[int.label];
                // If we passed the interval boundary
                if (now >= start + int.ms) {
                    // console.log(`[MetricsCollector] Flushing ${int.label} interval (boundary crossed)`);
                    await this.flushInterval(int.label, start, int.ms);
                    // Advance to next interval (could simply be aligning now, but be careful of gaps if app was down)
                    // For simplicity, just align now.
                    this.currentIntervalStart[int.label] = this.alignTimestamp(now, int.ms);
                }
            }
        } catch (error) {
            console.error('[MetricsCollector] Error in collect():', error);
        }
    }

    private async flushInterval(label: string, timestamp: number, durationMs: number) {
        const reqs = this.pendingDetails[label];
        // console.log(`[MetricsCollector] flushInterval(${label}) - ${reqs.length} requests pending`);
        // Reset pending only if we are moving forward. 
        // NOTE: In a real concurrent scenario, we'd need locking or atomic swap.
        // Javascript is single threaded so this is safe for CPU-bound stuff, 
        // but verify no awaits before clearing.
        this.pendingDetails[label] = [];

        if (reqs.length === 0) {
            // console.log(`[MetricsCollector] No requests for ${label}, skipping persist`);
            // Optional: Don't record empty intervals to save space? 
            // Or record zeros to show gaps in graphs.
            // Let's record zeros for continuity.
            return; // Don't persist empty intervals
        }

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
            eventLoopLatency: {
                min: this.eventLoopHistogram.min / 1e6,
                max: this.eventLoopHistogram.max / 1e6,
                mean: this.eventLoopHistogram.mean / 1e6,
                p50: this.eventLoopHistogram.percentile(50) / 1e6,
                p95: this.eventLoopHistogram.percentile(95) / 1e6,
                p99: this.eventLoopHistogram.percentile(99) / 1e6,
            },
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

        // console.log(`[MetricsCollector] Persisting ${label} metric at timestamp ${timestamp}`);
        try {
            const recordId = new RecordId('metrics', timestamp);
            await this.db.upsert(recordId, metric);
            // console.log(`[MetricsCollector] ✓ Successfully saved ${label} metric to datastore`);

            // DEBUG: Verify we can retrieve it immediately
            const test = await this.db.select(recordId);
            // console.log(`[MetricsCollector] DEBUG: Immediate .get() returned:`, test ? 'DATA' : 'NULL');

            // DEBUG: Try querying for it  
            const queryTest = await this.db.query("SELECT * FROM metrics WHERE id = $id", { id: recordId });
            // console.log(`[MetricsCollector] DEBUG: Query by id returned ${queryTest[0]?.length || 0} records`);
        } catch (e) {
            console.error(`[MetricsCollector] ✗ Failed to save metrics for ${label}:`, e);
        }
    }

    // Cleanup if needed
    public stop() {
        if (this.timer) clearInterval(this.timer);
        this.eventLoopHistogram.disable();
    }
}
