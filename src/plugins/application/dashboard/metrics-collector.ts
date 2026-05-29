import * as os from 'node:os';
import { monitorEventLoopDelay, PerformanceObserver } from 'node:perf_hooks';
import type { DatastoreAdapter } from '../../../util/adapter/datastore';
import { getProcess } from '../../../util/env';
import type { Logger } from '../../../util/logger';

interface AggregatedMetric {
    timestamp: number;
    interval: string;
    cpu: {
        user: number;
        system: number;
        total: number;
    };
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
    gcLatency: {
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
        p1: number;
        p10: number;
        p25: number;
        p50: number;
        p75: number;
        p90: number;
        p95: number;
        p99: number;
    };
    thirdPartyLatency: {
        min: number;
        max: number;
        avg: number;
        p50: number;
        p90: number;
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
    private pendingThirdPartyDetails: Record<string, { duration: number, isError: boolean; }[]> = {};
    private gcLatencies: number[] = [];

    private eventLoopHistogram: any;
    private gcObserver: PerformanceObserver | null = null;

    private timer: NodeJS.Timeout | null = null;
    private cpuUsageStart = getProcess()?.cpuUsage?.() || { user: 0, system: 0 };
    private cpuTimeStart = Date.now();

    public db?: DatastoreAdapter;

    constructor(
        db?: DatastoreAdapter,
        private onCollect?: (metric: AggregatedMetric) => void,
        private logger?: Logger
    ) {
        this.db = db;
        try {
            if (monitorEventLoopDelay) {
                this.eventLoopHistogram = monitorEventLoopDelay({ resolution: 10 });
                this.eventLoopHistogram.enable();
            }
        } catch (e) {
            this.logger?.warn('MetricsCollector', 'Failed to initialize event loop monitor', { error: e });
        }

        try {
            if (PerformanceObserver) {
                this.gcObserver = new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    for (const entry of entries) {
                        this.gcLatencies.push(entry.duration);
                    }
                });
                this.gcObserver.observe({ entryTypes: ['gc'] });
            }
        } catch (e) {
            this.logger?.warn('MetricsCollector', 'Failed to initialize GC monitor', { error: e });
        }


        // Initialize start times
        const now = Date.now();
        INTERVALS.forEach(int => {
            this.currentIntervalStart[int.label] = this.alignTimestamp(now, int.ms);
            this.pendingDetails[int.label] = [];
            this.pendingThirdPartyDetails[int.label] = [];
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
                this.logger?.error('MetricsCollector', 'Critical error in collect loop', e as any);
            }
        }, 1000); // Check every second for better precision
    }

    public recordRequest(duration: number, isError: boolean) {
        INTERVALS.forEach(int => {
            if (!this.pendingDetails[int.label]) this.pendingDetails[int.label] = [];
            this.pendingDetails[int.label].push({ duration, isError });
        });
    }

    public recordThirdPartyRequest(duration: number, isError: boolean) {
        INTERVALS.forEach(int => {
            if (!this.pendingThirdPartyDetails[int.label]) this.pendingThirdPartyDetails[int.label] = [];
            this.pendingThirdPartyDetails[int.label].push({ duration, isError });
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
                this.pendingThirdPartyDetails[int.label] = [];
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

        const thirdPartyReqs = this.pendingThirdPartyDetails[label] || [];
        this.pendingThirdPartyDetails[label] = [];

        // CPU Usage Calc since last flush
        const cpuUsageEnd = getProcess()?.cpuUsage?.() || { user: 0, system: 0 };
        const cpuTimeEnd = Date.now();
        const elapsedCpuTime = cpuTimeEnd - this.cpuTimeStart;
        const userUsage = (cpuUsageEnd.user - this.cpuUsageStart.user) / 1000;
        const systemUsage = (cpuUsageEnd.system - this.cpuUsageStart.system) / 1000;

        let cpuUserPercent = 0;
        let cpuSystemPercent = 0;
        let cpuTotalPercent = 0;

        if (elapsedCpuTime > 0) {
            cpuUserPercent = (userUsage / elapsedCpuTime) * 100;
            cpuSystemPercent = (systemUsage / elapsedCpuTime) * 100;
            cpuTotalPercent = cpuUserPercent + cpuSystemPercent;
        }

        // Only reset CPU usage trackers on the 10s interval (our base grain for system-level stats collection approximation)
        if (label === '10s') {
            this.cpuUsageStart = cpuUsageEnd;
            this.cpuTimeStart = cpuTimeEnd;
        }

        // Calculate inbound metrics
        const totalReqs = reqs.length;
        const errorReqs = reqs.filter(r => r.isError).length;
        const successReqs = totalReqs - errorReqs;

        const duratons = reqs.map(r => r.duration).sort((a, b) => a - b);
        const rps = totalReqs / (durationMs / 1000);
        const sum = duratons.reduce((a, b) => a + b, 0);
        const avg = totalReqs > 0 ? sum / totalReqs : 0;

        const getP = (arr: number[], p: number) => {
            if (arr.length === 0) return 0;
            const idx = Math.floor(arr.length * p);
            return arr[idx];
        };

        // Third Party latencies
        const thirdPartyDurations = thirdPartyReqs.map(r => r.duration).sort((a, b) => a - b);
        const thirdPartySum = thirdPartyDurations.reduce((a, b) => a + b, 0);
        const thirdPartyAvg = thirdPartyDurations.length > 0 ? thirdPartySum / thirdPartyDurations.length : 0;

        let eventLoopStats = { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
        if (this.eventLoopHistogram) {
            try {
                eventLoopStats = {
                    min: this.eventLoopHistogram.min / 1e6,
                    max: this.eventLoopHistogram.max / 1e6,
                    mean: this.eventLoopHistogram.mean / 1e6,
                    p50: this.eventLoopHistogram.percentile(50) / 1e6,
                    p95: this.eventLoopHistogram.percentile(95) / 1e6,
                    p99: this.eventLoopHistogram.percentile(99) / 1e6,
                };
                if (label === '10s') this.eventLoopHistogram.reset();
            } catch (e) { }
        }

        let gcStats = { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
        if (this.gcLatencies.length > 0) {
            const sortedGcLats = [...this.gcLatencies].sort((a, b) => a - b);
            gcStats = {
                min: sortedGcLats[0],
                max: sortedGcLats[sortedGcLats.length - 1],
                mean: sortedGcLats.reduce((a, b) => a + b, 0) / sortedGcLats.length,
                p50: getP(sortedGcLats, 0.50),
                p95: getP(sortedGcLats, 0.95),
                p99: getP(sortedGcLats, 0.99),
            };
        }
        if (label === '10s') this.gcLatencies = [];

        const metric: AggregatedMetric = {
            timestamp,
            interval: label,
            cpu: {
                user: cpuUserPercent,
                system: cpuSystemPercent,
                total: cpuTotalPercent
            },
            load: os.loadavg(),
            memory: {
                used: getProcess()?.memoryUsage?.().rss || 0,
                total: os.totalmem(),
                heapUsed: getProcess()?.memoryUsage?.().heapUsed || 0,
                heapTotal: getProcess()?.memoryUsage?.().heapTotal || 0,
            },
            eventLoopLatency: eventLoopStats,
            gcLatency: gcStats,
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
                p1: getP(duratons, 0.01),
                p10: getP(duratons, 0.10),
                p25: getP(duratons, 0.25),
                p50: getP(duratons, 0.50),
                p75: getP(duratons, 0.75),
                p90: getP(duratons, 0.90),
                p95: getP(duratons, 0.95),
                p99: getP(duratons, 0.99),
            },
            thirdPartyLatency: {
                min: thirdPartyDurations[0] || 0,
                max: thirdPartyDurations[thirdPartyDurations.length - 1] || 0,
                avg: thirdPartyAvg,
                p50: getP(thirdPartyDurations, 0.50),
                p90: getP(thirdPartyDurations, 0.90),
                p95: getP(thirdPartyDurations, 0.95),
                p99: getP(thirdPartyDurations, 0.99),
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
        try { if (this.eventLoopHistogram) this.eventLoopHistogram.disable(); } catch (e) { }
        try { if (this.gcObserver) this.gcObserver.disconnect(); } catch (e) { }
    }
}
