import { NgTemplateOutlet, UpperCasePipe } from '@angular/common';
import { Component, Input, signal } from '@angular/core';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'skp-app-registry-tree',
    standalone: true,
    imports: [NgScrollbarModule, TooltipModule, UpperCasePipe, NgTemplateOutlet],
    templateUrl: './app-registry-tree.component.html',
    styleUrl: './app-registry-tree.component.scss'
})
export class AppRegistryTreeComponent {
    @Input() set rawData(value: any) {
        if (value) {
            this.processData(value);
        }
    }
    @Input() metrics: any = {};
    @Input() requests: any[] = [];

    readonly rootItems = signal<any[]>([]);

    private processData(root: any) {
        const allItems: any[] = [];
        if (root.middleware) root.middleware.forEach((i: any) => allItems.push({ ...i, kind: 'middleware' }));
        if (root.routes) root.routes.forEach((i: any) => allItems.push({ ...i, kind: 'route' }));
        if (root.routers) root.routers.forEach((i: any) => allItems.push({ ...i, kind: 'router' }));
        if (root.controllers) root.controllers.forEach((i: any) => allItems.push({ ...i, kind: 'controller' }));
        if (root.events) root.events.forEach((i: any) => allItems.push({ ...i, kind: 'event' }));

        const kindPriority: Record<string, number> = { 'middleware': 0, 'router': 1, 'controller': 2, 'route': 3, 'event': 4 };

        allItems.sort((a, b) => {
            const pA = kindPriority[a.kind] !== undefined ? kindPriority[a.kind] : 99;
            const pB = kindPriority[b.kind] !== undefined ? kindPriority[b.kind] : 99;
            if (pA !== pB) return pA - pB;
            return (a.order || 0) - (b.order || 0);
        });

        const uniqueItems: any[] = [];
        const seenIds = new Set<string>();
        allItems.forEach(item => {
            const uniqueKey = item.id || (item.kind + ':' + (item.path || item.name));
            if (!seenIds.has(uniqueKey)) {
                seenIds.add(uniqueKey);
                uniqueItems.push(item);
            }
        });

        this.rootItems.set(uniqueItems);
    }

    isBuiltin(meta: any): boolean {
        return meta?.isBuiltin === true;
    }

    getChildren(item: any): any[] {
        return Array.isArray(item.children) ? item.children : [];
    }

    getRelativePath(absolutePath: string): string {
        if (!absolutePath) return '';
        const match = absolutePath.match(/.*?\/(src|examples|client)\/(.*)/);
        if (match) {
            return `${match[1]}/${match[2]}`;
        }
        return absolutePath.split('/').pop() || absolutePath;
    }

    getIdeLink(absolutePath: string, line?: number): string {
        if (!absolutePath) return '';
        return `vscode://file${absolutePath}${line ? ':' + line : ''}`;
    }

    getObjectKeys(obj: any): string[] {
        return obj ? Object.keys(obj) : [];
    }

    getNodeStats(item: any): any {
        if (!item) return null;

        const requests = this.requests || [];

        let hits = requests.filter(req => {
            if (req.handlerStack && req.handlerStack.some((h: any) =>
                h.name === item.name &&
                h.file === item.metadata?.file &&
                h.line === item.metadata?.line
            )) return true;

            if (item.path && req.url && req.url.includes(item.path)) return true;
            return false;
        });

        const count = hits.length;
        if (count === 0) {
            return {
                requests: 0,
                trafficPercent: '0.0',
                failures: 0,
                p1: '0.00',
                p10: '0.00',
                p25: '0.00',
                p50: '0.00',
                p75: '0.00',
                p90: '0.00',
                p99: '0.00',
                statusCodes: {}
            };
        }

        const totalReqs = this.requests.length;
        const trafficPercent = ((count / totalReqs) * 100).toFixed(1);

        const durations = hits.map(h => h.duration).sort((a, b) => a - b);

        const getP = (p: number) => {
            if (durations.length === 0) return '0.00';
            let index = Math.ceil((p / 100) * durations.length) - 1;
            index = Math.max(0, Math.min(index, durations.length - 1));
            return durations[index].toFixed(2);
        };

        const statusCodes = hits.reduce((acc: any, req: any) => {
            acc[req.status] = (acc[req.status] || 0) + 1;
            return acc;
        }, {});

        // Compute failures based on status code >= 400
        const failures = hits.filter(h => h.status >= 400).length;

        return {
            requests: count,
            trafficPercent,
            failures,
            p1: getP(1),
            p10: getP(10),
            p25: getP(25),
            p50: getP(50),
            p75: getP(75),
            p90: getP(90),
            p99: getP(99),
            statusCodes
        };
    }
}
