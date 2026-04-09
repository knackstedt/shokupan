import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, input, OnDestroy, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import type { EChartsOption } from 'echarts';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { TabulatorModule } from 'ngx-tabulator-tables';
import { EChartComponent } from '../echart/echarts.component';
import { formatDurationPretty, NetworkRequest } from './network-tools/network-utils';

interface LogEntry {
    timestamp: number;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    source?: string;
}

interface MetricsData {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    activeRequests: number;
    averageTotalTime_ms: number;
    recentTimings: number[];
    logs: LogEntry[];
}

@Component({
    selector: 'skp-dashboard-overview',
    standalone: true,
    imports: [FormsModule, DecimalPipe, DatePipe, EChartComponent, NgScrollbarModule, TabulatorModule],
    templateUrl: './overview.component.html',
    styleUrl: './overview.component.scss',
})
export class DashboardOverviewComponent implements OnInit, OnDestroy {
    private http = inject(HttpClient);
    private destroyRef = takeUntilDestroyed();
    private interval: ReturnType<typeof setInterval> | undefined;

    // Inputs from parent dashboard
    readonly metrics = input<MetricsData>({
        totalRequests: 0, successfulRequests: 0, failedRequests: 0,
        activeRequests: 0, averageTotalTime_ms: 0, recentTimings: [], logs: [],
    });
    readonly requests = input<NetworkRequest[]>([]);
    readonly wsConnected = input(false);

    readonly requestSelect = output<string>();
    readonly purge = output<void>();

    timeframe = signal<string>('1m');

    responseOptions = signal<EChartsOption>(this.getBaseOption('Response Time (ms)'));
    responseUpdate = signal<any[]>([]);

    rpsOptions = signal<EChartsOption>(this.getBaseOption('Requests/sec'));
    rpsUpdate = signal<any[]>([]);

    cpuOptions = signal<EChartsOption>(this.getBaseOption('CPU & Load'));
    cpuUpdate = signal<any[]>([]);

    memoryOptions = signal<EChartsOption>(this.getBaseOption('Memory (MB)'));
    memoryUpdate = signal<any[]>([]);

    eventLoopOptions = signal<EChartsOption>(this.getBaseOption('Event Loop Latency (ms)'));
    eventLoopUpdate = signal<any[]>([]);

    gcOptions = signal<EChartsOption>(this.getBaseOption('GC Latency (ms)'));
    gcUpdate = signal<any[]>([]);

    thirdPartyOptions = signal<EChartsOption>(this.getBaseOption('Third Party Latency (ms)'));
    thirdPartyUpdate = signal<any[]>([]);

    ngOnInit() {
        this.fetchData();
        this.interval = setInterval(() => this.fetchData(), 10000);
    }

    ngOnDestroy() {
        clearInterval(this.interval);
    }

    onTimeframeChange(newTimeframe: string) {
        this.timeframe.set(newTimeframe);
        this.fetchData();
    }

    onRowClick(id: string) {
        this.requestSelect.emit(id);
    }

    onPurge() {
        this.purge.emit();
    }

    formatDuration(ms: number) {
        return formatDurationPretty(ms);
    }

    rowFormatter = (row: any) => {
        const data = row.getData();
        if (data.status >= 400) {
            row.getElement().classList.add('row-error');
        } else {
            row.getElement().classList.remove('row-error');
        }
    };

    private getBaseOption(title: string): EChartsOption {
        return {
            title: { text: title, top: 5, textStyle: { color: '#e0e0e0', fontSize: 14 } },
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(22, 27, 34, 0.95)',
                borderColor: '#30363d',
                textStyle: { color: '#c9d1d9', fontSize: 12 },
                transitionDuration: 0,
                formatter: (params: any) => {
                    const time = new Date(params[0].value[0]).toLocaleTimeString();
                    let html = `<div style="margin-bottom:4px;color:#888">${time}</div>`;
                    for (const p of params) {
                        const val = p.value[1];
                        let formattedVal = val;
                        if (typeof val === 'number') {
                            if (val < 0.01 && val > 0) {
                                formattedVal = val.toExponential(2);
                            } else if (val > 1000) {
                                formattedVal = Math.round(val).toLocaleString();
                            } else {
                                formattedVal = Number(val.toFixed(2));
                            }
                        }
                        html += `
                            <div style="display:flex;justify-content:space-between;gap:12px;margin:2px 0;">
                                <span style="display:flex;align-items:center;gap:6px;">
                                    ${p.marker} <span>${p.seriesName}</span>
                                </span>
                                <span style="font-weight:bold;color:#fff">${formattedVal}</span>
                            </div>
                        `;
                    }
                    return html;
                }
            },
            legend: {
                top: 32,
                right: 10,
                textStyle: { color: '#a0a0a0', fontSize: 11 },
                // Default icon for non-percentile series: a slim filled bar
                icon: 'path://M0,0 L28,0 L28,4 L0,4 Z',
                itemWidth: 28,
                itemHeight: 4,
                itemGap: 16,
            },
            grid: { left: '3%', right: '4%', top: 65, bottom: '15%', containLabel: true },
            xAxis: { type: 'time', splitLine: { show: false }, axisLabel: { color: '#888' } },
            yAxis: { type: 'value', splitLine: { lineStyle: { color: '#333' } }, axisLabel: { color: '#888' } },
            dataZoom: [
                {
                    type: 'inside', start: 0, end: 100, minValueSpan: 60000,
                    throttle: 20,
                },
                { type: 'slider', start: 0, end: 100, bottom: 0, height: 20, minValueSpan: 60000 }
            ],
            color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b']
        };
    }

    private fetchData() {
        this.http.get<{ metrics: any[]; }>(`/dashboard/metrics/history?interval=${this.timeframe()}`)
            .pipe(this.destroyRef)
            .subscribe({
            next: (res: any) => {
                if (!res.metrics || !res.metrics.length) return;
                this.processData(res.metrics);
            },
            error: (err) => {
                console.error('[Dashboard] Failed to fetch metrics', err);
            }
        });
    }

    private processData(data: any[]) {
        if (!data.length) return;

        // Builds a top-to-bottom RGBA fade for a given hex colour
        const makeGradient = (hex: string, peakOpacity = 0.22) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return {
                type: 'linear' as const,
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                    { offset: 0, color: `rgba(${r},${g},${b},${peakOpacity})` },
                    { offset: 1, color: `rgba(${r},${g},${b},0)` },
                ],
            };
        };

        // Generic series — area gradient inherits the palette colour via opacity
        const makeSeries = (extractor: (d: any) => number, name: string) => ({
            name,
            type: 'line',
            smooth: false,
            showSymbol: false,
            sampling: 'lttb',
            large: true,
            largeThreshold: 500,
            areaStyle: { opacity: 0.15 },
            data: data.map(d => [d.timestamp, extractor(d)]),
        });

        // Legend icon paths — filled rectangles that visually echo the line type
        const LEGEND_ICON = {
            // single solid bar
            solid: 'path://M0,0 L28,0 L28,4 L0,4 Z',
            // three evenly-spaced dash blocks
            dashed: 'path://M0,0 L8,0 L8,4 L0,4 Z  M10,0 L18,0 L18,4 L10,4 Z  M20,0 L28,0 L28,4 L20,4 Z',
            // five equally-spaced dot squares
            dotted: 'path://M0,0 L4,0 L4,4 L0,4 Z  M6,0 L10,0 L10,4 L6,4 Z  M12,0 L16,0 L16,4 L12,4 Z  M18,0 L22,0 L22,4 L18,4 Z  M24,0 L28,0 L28,4 L24,4 Z',
        };

        // Percentile series — explicit colour, lineStyle, gradient fill, and matching legend icon
        const makePercentile = (
            extractor: (d: any) => number,
            name: string,
            color: string,
            lineWidth: number,
            lineType: 'solid' | 'dashed' | 'dotted' = 'solid',
        ) => ({
            name,
            type: 'line',
            smooth: false,
            showSymbol: false,
            sampling: 'lttb',
            large: true,
            largeThreshold: 500,
            legendIcon: LEGEND_ICON[lineType],
            itemStyle: { color },
            lineStyle: { color, width: lineWidth, type: lineType },
            areaStyle: { color: makeGradient(color) },
            data: data.map(d => [d.timestamp, extractor(d)]),
        });

        this.responseUpdate.set([
            makePercentile(d => d.responseTime?.p1 || 0, 'p1', '#D6D3D1', 1, 'dotted'),
            makePercentile(d => d.responseTime?.p10 || 0, 'p10', '#A38DA3', 1.5, 'dashed'),
            makePercentile(d => d.responseTime?.p25 || 0, 'p25', '#7B5E7B', 1.5),
            makePercentile(d => d.responseTime?.p50 || 0, 'p50', '#FFB380', 2.5),
            makePercentile(d => d.responseTime?.p75 || 0, 'p75', '#7B5E7B', 1.5),
            makePercentile(d => d.responseTime?.p90 || 0, 'p90', '#A38DA3', 1.5, 'dashed'),
            makePercentile(d => d.responseTime?.p99 || 0, 'p99', '#D6D3D1', 1, 'dotted'),
        ]);

        this.rpsUpdate.set([
            makeSeries(d => d.requests?.success || 0, 'Success'),
            makeSeries(d => d.requests?.error || 0, 'Error'),
        ]);

        this.cpuUpdate.set([
            makeSeries(d => d.cpu?.user || 0, 'User CPU%'),
            makeSeries(d => d.cpu?.system || 0, 'System CPU%'),
            makeSeries(d => d.load?.[0] || 0, 'Load (1m)'),
        ]);

        this.memoryUpdate.set([
            makeSeries(d => (d.memory?.used || 0) / 1024 / 1024, 'RSS Used'),
            makeSeries(d => (d.memory?.heapUsed || 0) / 1024 / 1024, 'Heap Used'),
        ]);

        this.eventLoopUpdate.set([
            makeSeries(d => d.eventLoopLatency?.mean || 0, 'Mean'),
            makeSeries(d => d.eventLoopLatency?.p99 || 0, 'p99'),
        ]);

        this.gcUpdate.set([
            makeSeries(d => d.gcLatency?.mean || 0, 'Mean'),
            makeSeries(d => d.gcLatency?.p95 || 0, 'p95'),
        ]);

        this.thirdPartyUpdate.set([
            makeSeries(d => d.thirdPartyLatency?.p50 || 0, 'p50'),
            makeSeries(d => d.thirdPartyLatency?.p90 || 0, 'p90'),
            makeSeries(d => d.thirdPartyLatency?.p99 || 0, 'p99'),
        ]);
    }
}
