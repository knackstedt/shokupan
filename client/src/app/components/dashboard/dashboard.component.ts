import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
    Component,
    inject,
    OnDestroy, OnInit, signal
} from '@angular/core';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { AppGraphComponent } from './app-graph.component';
import { AppRegistryTreeComponent } from './app-registry-tree.component';

interface Metrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    activeRequests: number;
    averageTotalTime_ms: number;
    recentTimings: number[];
    logs: any[];
}

@Component({
    selector: 'skp-dashboard',
    standalone: true,
    imports: [DecimalPipe, DatePipe, NgScrollbarModule, AppRegistryTreeComponent, AppGraphComponent],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
    private http = inject(HttpClient);

    readonly activeTab = signal<'overview' | 'network' | 'application'>('overview');

    readonly metrics = signal<Metrics>({
        totalRequests: 0, successfulRequests: 0, failedRequests: 0,
        activeRequests: 0, averageTotalTime_ms: 0, recentTimings: [], logs: [],
    });
    readonly requests = signal<any[]>([]);
    readonly appData = signal<any>(null);
    readonly wsConnected = signal(false);

    private ws: WebSocket | null = null;
    private reconnectTimer: any;

    ngOnInit(): void {
        this.fetchRequests();
        this.fetchRegistry();
        this.connectWs();
    }

    ngOnDestroy(): void {
        this.ws?.close();
        clearTimeout(this.reconnectTimer);
    }

    setTab(tab: 'overview' | 'network' | 'application') {
        this.activeTab.set(tab);
        if (tab === 'application' && !this.appData()) {
            this.fetchRegistry();
        }
    }

    private connectWs(): void {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${proto}//${location.host}/dashboard/ws`);

        this.ws.addEventListener('open', () => this.wsConnected.set(true));
        this.ws.addEventListener('close', () => {
            this.wsConnected.set(false);
            this.reconnectTimer = setTimeout(() => this.connectWs(), 3000);
        });
        this.ws.addEventListener('message', (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'metrics-update' && msg.metrics) {
                    this.metrics.set(msg.metrics);
                }
                if (msg.type === 'request-update' && msg.requests) {
                    this.requests.update(prev => [...msg.requests, ...prev].slice(0, 200));
                }
            } catch { /* ignore parse errors */ }
        });
    }

    fetchRequests(): void {
        this.http.get<{ requests: any[]; }>('/dashboard/requests').subscribe({
            next: ({ requests }) => this.requests.set(requests),
            error: () => { },
        });
        this.http.get<{ metrics: Metrics; uptime: string; }>('/dashboard/metrics').subscribe({
            next: ({ metrics }) => this.metrics.set(metrics),
            error: () => { },
        });
    }

    fetchRegistry(): void {
        this.http.get<any>('/dashboard/registry').subscribe({
            next: (data) => this.appData.set(data.registry || data),
            error: (err) => console.error("Failed to load registry", err)
        });
    }

    purgeRequests(): void {
        this.http.delete('/dashboard/requests').subscribe({
            next: () => {
                this.requests.set([]);
                this.metrics.set({
                    totalRequests: 0, successfulRequests: 0, failedRequests: 0,
                    activeRequests: 0, averageTotalTime_ms: 0, recentTimings: [], logs: [],
                });
            },
            error: () => { },
        });
    }
}
