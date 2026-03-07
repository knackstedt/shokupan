import { HttpClient } from '@angular/common/http';
import {
    Component,
    inject,
    OnDestroy, OnInit, signal
} from '@angular/core';
import { AppGraphComponent } from './app-graph.component';
import { AppRegistryTreeComponent } from './app-registry-tree.component';
import { NetworkToolsComponent } from './network-tools/network-tools.component';
import { DashboardOverviewComponent } from './overview.component';

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
    imports: [AppRegistryTreeComponent, AppGraphComponent, NetworkToolsComponent, DashboardOverviewComponent],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
    private http = inject(HttpClient);

    readonly activeTab = signal<'overview' | 'network' | 'application'>('overview');
    readonly viewMode = signal<'tree' | 'graph'>('graph');

    readonly metrics = signal<Metrics>({
        totalRequests: 0, successfulRequests: 0, failedRequests: 0,
        activeRequests: 0, averageTotalTime_ms: 0, recentTimings: [], logs: [],
    });
    readonly requests = signal<any[]>([]);
    readonly selectedRequestId = signal<string | null>(null);
    readonly appData = signal<any>(null);
    readonly wsConnected = signal(false);

    private ws: WebSocket | null = null;
    private reconnectTimer: any;

    ngOnInit(): void {
        this.syncHashUrl();
        window.addEventListener('hashchange', this.onHashChange);
        this.fetchRequests();
        this.fetchRegistry();
        this.connectWs();
    }

    ngOnDestroy(): void {
        window.removeEventListener('hashchange', this.onHashChange);
        this.ws?.close();
        clearTimeout(this.reconnectTimer);
    }

    private onHashChange = () => {
        this.syncHashUrl();
    };

    private syncHashUrl() {
        const hash = window.location.hash; // e.g. '#/dashboard/overview'
        if (hash.startsWith('#/dashboard/')) {
            const tab = hash.replace('#/dashboard/', '') as 'overview' | 'network' | 'application';
            if (['overview', 'network', 'application'].includes(tab)) {
                this.activeTab.set(tab);
                if (tab === 'application' && !this.appData()) {
                    this.fetchRegistry();
                }
                return;
            }
        }
        // default fallback if hash is missing or invalid
        if (hash !== '#/dashboard/overview') {
            window.location.hash = '#/dashboard/overview';
        } else {
            this.activeTab.set('overview');
        }
    }

    setTab(tab: 'overview' | 'network' | 'application') {
        console.log("Dashboard: setting tab to", tab);
        if (window.location.hash !== '#/dashboard/' + tab) {
            window.location.hash = '#/dashboard/' + tab;
        }
    }

    setViewMode(mode: 'tree' | 'graph') {
        this.viewMode.set(mode);
    }

    selectRequest(id: string | null) {
        console.log("Dashboard: selectRequest called with ID", id);
        this.selectedRequestId.set(id);
        if (id) {
            this.setTab('network');
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
                if (msg.type === 'requests-update' && msg.requests) {
                    const newReqs = msg.requests.map((r: any) => ({ ...r, id: r.id || `${r.timestamp}-${r.method}-${r.url}` }));
                    this.requests.update(prev => [...newReqs, ...prev].slice(0, 200));
                }
            } catch { /* ignore parse errors */ }
        });
    }
    fetchRequests(): void {
        this.http.get<{ requests: any[]; }>('/dashboard/requests').subscribe({
            next: ({ requests }) => this.requests.set(requests.map(r => ({ ...r, id: r.id || `${r.timestamp}-${r.method}-${r.url}` }))),
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
