import { NgTemplateOutlet, UpperCasePipe } from '@angular/common';
import { Component, inject, Input, OnChanges, SecurityContext, signal, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'skp-app-registry-tree',
    standalone: true,
    imports: [NgScrollbarModule, TooltipModule, UpperCasePipe, NgTemplateOutlet],
    templateUrl: './app-registry-tree.component.html',
    styleUrl: './app-registry-tree.component.scss'
})
export class AppRegistryTreeComponent implements OnChanges {
    private sanitizer = inject(DomSanitizer);

    @Input() set rawData(value: any) {
        if (value) {
            this.processData(value);
        }
    }
    @Input() metrics: any = {};
    @Input() requests: any[] = [];

    readonly rootItems = signal<any[]>([]);

    /** All unique absolute file paths found in the registry, for shortest-path computation */
    private allFilePaths = new Set<string>();

    ngOnChanges(changes: SimpleChanges) {
        // Recompute shortest paths whenever requests change
    }

    private collectFilePaths(item: any) {
        if (item?.metadata?.file) this.allFilePaths.add(item.metadata.file);
        if (Array.isArray(item.children)) item.children.forEach((c: any) => this.collectFilePaths(c));
        if (item.children?.routes) item.children.routes.forEach((c: any) => this.collectFilePaths(c));
        if (Array.isArray(item.middleware)) item.middleware.forEach((c: any) => this.collectFilePaths(c));
        if (Array.isArray(item.routes)) item.routes.forEach((c: any) => this.collectFilePaths(c));
        if (Array.isArray(item.routers)) item.routers.forEach((c: any) => this.collectFilePaths(c));
        if (Array.isArray(item.controllers)) item.controllers.forEach((c: any) => this.collectFilePaths(c));
        if (Array.isArray(item.events)) item.events.forEach((c: any) => this.collectFilePaths(c));
    }

    private processData(root: any) {
        this.allFilePaths.clear();
        this.collectFilePaths(root);

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

    /**
     * Returns the shortest suffix of `absolutePath` (split on '/') that is
     * unique among all collected file paths. Falls back to the filename alone.
     */
    getShortestPath(absolutePath: string | undefined): string {
        if (!absolutePath) return '';
        const segments = absolutePath.split('/').filter(Boolean);
        const allPaths = Array.from(this.allFilePaths);

        // Find the minimum number of trailing segments that makes this path unique
        for (let n = 1; n <= segments.length; n++) {
            const suffix = segments.slice(-n).join('/');
            const matches = allPaths.filter(p => p.endsWith('/' + suffix) || p === suffix);
            if (matches.length === 1) return suffix;
        }
        // If still ambiguous (shouldn't happen), return last 2 segments
        return segments.slice(-2).join('/');
    }

    getIdeLink(absolutePath: string, line?: number): string {
        if (!absolutePath) return '';
        return `vscode://file${absolutePath}${line ? ':' + line : ''}`;
    }

    getObjectKeys(obj: any): string[] {
        return obj ? Object.keys(obj) : [];
    }

    /**
     * Highlights :params, * wildcards, .well-known segments in the path.
     * Returns sanitized HTML safe for [innerHTML].
     */
    highlightPath(path: string | undefined): SafeHtml {
        if (!path) return '';
        const html = path.split('/').map((seg, i) => {
            if (!seg) return i === 0 ? '' : '';
            const escaped = this.sanitizer.sanitize(SecurityContext.HTML, seg) || '';
            if (seg.startsWith(':')) {
                return `<span class="path-param">${escaped}</span>`;
            }
            if (seg === '*' || seg === '**') {
                return `<span class="path-wildcard">${escaped}</span>`;
            }
            if (seg.startsWith('.')) {
                return `<span class="path-dotfile">${escaped}</span>`;
            }
            return escaped;
        }).join('<span class="path-sep">/</span>');
        return this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
    }

    getNodeStats(item: any): any {
        if (!item) return null;

        const requests = this.requests || [];

        const hits = requests.filter(req => {
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
                p1: '0.00', p10: '0.00', p25: '0.00',
                p50: '0.00', p75: '0.00', p90: '0.00', p99: '0.00',
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

        const failures = hits.filter(h => h.status >= 400).length;

        return {
            requests: count, trafficPercent, failures,
            p1: getP(1), p10: getP(10), p25: getP(25), p50: getP(50),
            p75: getP(75), p90: getP(90), p99: getP(99),
            statusCodes
        };
    }

    /** Builds an HTML string for PrimeNG's [pTooltip] with [escape]="false" */
    buildTooltipHtml(item: any): string {
        const stats = this.getNodeStats(item);
        if (!stats) return '';

        const row = (label: string, value: string | number, color?: string) =>
            `<div class="tt-row"><span>${label}</span><span${color ? ` style="color:${color}"` : ''}>${value}</span></div>`;

        const statusRows = Object.keys(stats.statusCodes).map(code =>
            row(`HTTP ${code}`, stats.statusCodes[code])
        ).join('');

        return `<div class="tt-body">
                <div class="tt-header">Metrics</div>
                ${row('Requests', stats.requests)}
                ${row('Traffic', stats.trafficPercent + '%')}
                ${row('Failures', stats.failures, stats.failures > 0 ? '#ef4444' : undefined)}
                <div class="tt-header" style="margin-top:8px">Response Times</div>
                ${row('p1', stats.p1 + 'ms')}
                ${row('p10', stats.p10 + 'ms')}
                ${row('p25', stats.p25 + 'ms')}
                ${row('p50', stats.p50 + 'ms')}
                ${row('p75', stats.p75 + 'ms')}
                ${row('p90', stats.p90 + 'ms')}
                ${row('p99', stats.p99 + 'ms')}
                ${statusRows ? `<div class="tt-divider"></div>${statusRows}` : ''}
            </div>`;
    }
}

