import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, Inject, inject, Input, PLATFORM_ID, SecurityContext, signal, ViewEncapsulation } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { XYFlowModule } from 'ngx-xyflow';
import { TooltipModule } from 'primeng/tooltip';

// elkjs logic
import ELK from 'elkjs/lib/elk.bundled.js';
import { ElkEdge } from './edge';

@Component({
    selector: 'skp-app-graph',
    standalone: true,
    imports: [
        TooltipModule,
        XYFlowModule
    ],
    templateUrl: './app-graph.component.html',
    styleUrl: './app-graph.component.scss',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppGraphComponent {
    private isBrowser: boolean;
    private sanitizer = inject(DomSanitizer);

    @Input() set rawData(value: any) {
        if (value && this.isBrowser) {
            this.generateGraph(value);
        }
    }
    @Input() metrics: any = {};
    @Input() requests: any[] = [];

    readonly customEdges = { elk: ElkEdge }

    nodes = signal<any[]>([]);
    edges = signal<any[]>([]);

    readonly fitView = signal(false);

    constructor(@Inject(PLATFORM_ID) platformId: Object) {
        this.isBrowser = isPlatformBrowser(platformId);
    }

    private async generateGraph(rootContext: any) {
        if (!this.isBrowser) return;

        const newNodes: any[] = [];
        const newEdges: any[] = [];

        // Build the nodes from the deeply nested context.
        const processContext = (ctx: any, incomingSourceId?: string, forcedKind?: string, isRootEntry = false) => {
            if (!ctx) return;

            const ctxId = ctx.id || ctx.name || ctx.path || (ctx === rootContext ? 'app-root' : 'unknown-node');
            const kind = ctx.kind || forcedKind || (ctx === rootContext ? 'router' : 'unknown');
            const label = ctx === rootContext ? 'Root Application' : (ctx.name || ctx.path || kind);

            // extract routes (endpoints) if any, we'll store them in data
            const endpoints: { id: string, method: string, path: string; }[] = [];

            // Map middleware directly into the node's endpoint list as 'USE' methods
            if (!isRootEntry && kind !== 'middleware') {
                const mwArray = ctx.middleware || ctx.children?.middleware || [];
                mwArray.forEach((mw: any) => {
                    endpoints.push({
                        id: mw.id || mw.name || 'unnamed',
                        method: 'USE',
                        path: mw.name || 'unnamed middleware'
                    });
                });
            }

            const routesArray = ctx.routes || ctx.children?.routes;
            if (routesArray && Array.isArray(routesArray)) {
                routesArray.forEach((r: any) => {
                    endpoints.push({ id: r.id || r.path, method: r.method || 'GET', path: r.path });
                });
            }

            // create a node (only if it's not a route)
            if (kind !== 'route' && kind !== 'middleware') {
                // Header: 42px (padding + content + border)
                // Endpoints list padding: 12px (6 top + 6 bottom)
                // Each endpoint row: 28px (12px padding + 16px content)
                const calculatedHeight = 42 + (endpoints.length ? 12 + (endpoints.length * 28) : 0);
                newNodes.push({
                    id: ctxId,
                    type: 'custom',
                    data: { kind, label, endpoints, nodeHeight: calculatedHeight },
                    point: { x: 0, y: 0 },
                    width: 380,
                    height: calculatedHeight,
                });
            }

            // Handle middleware interception
            const mwArray = isRootEntry ? [] : (ctx.middleware || ctx.children?.middleware || []);
            if (mwArray.length > 0 && kind !== 'middleware') {
                let prevSourceId = incomingSourceId;

                mwArray.forEach((mw: any, idx: number) => {
                    const mwId = mw.id || `${ctxId}-mw-${idx}-${mw.name || 'unnamed'}`;
                    // Middleware nodes are compact: just header (42px)
                    newNodes.push({
                        id: mwId,
                        type: 'custom',
                        data: { kind: 'middleware', label: mw.name || 'Middleware', endpoints: [], nodeHeight: 42 },
                        point: { x: 0, y: 0 },
                        width: 380,
                        height: 42,
                    });

                    if (prevSourceId) {
                        newEdges.push({
                            id: `e-${prevSourceId}-${mwId}`,
                            source: prevSourceId,
                            target: mwId,
                            type: 'elk',
                            edgeMarkers: { end: { type: 'arrowClosed' } }
                        });
                    }
                    prevSourceId = mwId;
                });

                if (prevSourceId && kind !== 'middleware') {
                    newEdges.push({
                        id: `e-${prevSourceId}-${ctxId}`,
                        source: prevSourceId,
                        target: ctxId,
                        type: 'elk',
                        edgeMarkers: { end: { type: 'arrowClosed' } }
                    });
                }

                // Clear generic source
                incomingSourceId = undefined;
            }

            if (incomingSourceId && incomingSourceId !== ctxId && kind !== 'middleware') {
                newEdges.push({
                    id: `e-${incomingSourceId}-${ctxId}`,
                    source: incomingSourceId,
                    target: ctxId,
                    type: 'elk',
                    edgeMarkers: { end: { type: 'arrowClosed' } }
                });
            }

            const collections: Record<string, string> = {
                // 'routes': 'route', // Skipped because they are mapped to endpoints payload
                'events': 'event',
                'controllers': 'controller',
                'routers': 'router'
            };

            Object.entries(collections).forEach(([collectionName, childKind]) => {
                const collection = ctx[collectionName] || ctx.children?.[collectionName];
                if (Array.isArray(collection)) {
                    collection.forEach((child: any) => {
                        processContext(child, ctxId, childKind);
                    });
                }
            });
        };

        const mwArray = rootContext?.middleware || rootContext?.children?.middleware || [];
        const entryEndpoints = mwArray.map((mw: any) => ({
            id: mw.id || mw.name || 'unnamed',
            method: 'USE',
            path: mw.name || 'unnamed middleware'
        }));

        const entryId = 'http-entry';
        // Header: 42px, endpoints padding: 12px, each row: 28px
        const entryCalculatedHeight = 42 + (entryEndpoints.length ? 12 + (entryEndpoints.length * 28) : 0);
        newNodes.push({
            id: entryId,
            type: 'custom',
            data: { kind: 'entrypoint', label: 'HTTP Request', endpoints: entryEndpoints, nodeHeight: entryCalculatedHeight },
            point: { x: 0, y: 0 },
            width: 380,
            height: entryCalculatedHeight,
        });

        processContext(rootContext, entryId, 'router', true);

        try {
            const layouted = await this.applyElkLayout(newNodes, newEdges);

            console.log({ layouted });
            this.nodes.set(layouted.nodes);
            this.edges.set(layouted.edges);
        } catch (e) {
            console.error("ELK structure failed:", e);
            // Fallback to unstructured dump
            this.nodes.set(newNodes);
            this.edges.set(newEdges);
        }
    }

    private async applyElkLayout(nodes: any[], edges: any[]) {
        const elk = new ELK();
        const nodeNodeGap = '40';
        const layerGap = '80';
        const nodeEdgeGap = '20';
        const graph: any = {
            id: "root",
            layoutOptions: {
                'elk.algorithm': 'layered',
                'elk.direction': 'RIGHT',
                'elk.spacing.nodeNode': '40', // strictly 80px between nodes
                'elk.layered.spacing.nodeNodeBetweenLayers': '90',
                'elk.spacing.edgeNode': '40',
                'elk.layered.spacing.edgeEdgeBetweenLayers': '40',
                'elk.layered.spacing.edgeNodeBetweenLayers': '40',
                'elk.layered.wrapping.additionalEdgeSpacing': '40',
                'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
                'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED'
            },
            children: nodes.map(n => ({ ...n, width: n.width || 380, height: n.height || 40 })),
            edges: edges.map(e => ({ ...e, sources: [e.source], targets: [e.target] }))
        };

        const laidOut = await elk.layout(graph) as any;

        return {
            nodes: nodes.map(n => {
                const elkNode = laidOut.children?.find((c: any) => c.id === n.id);
                if (elkNode) {
                    return { ...n, position: { x: elkNode.x || 0, y: elkNode.y || 0 } };
                }
                return n;
            }),
            edges: laidOut.edges.map((e: any) => ({
                ...e,
                data: { path: e.sections?.[0] }
            }))
        };
    }

    /**
     * Highlights :params, * wildcards, .well-known segments in the path.
     * Returns sanitized HTML safe for display.
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
        if (!item || !item.data) return null;

        // Graph node data maps kind, label, endpoints.
        // We will try to match based on endpoints to replicate tree matching
        const requests = this.requests || [];
        const kind = item.data.kind;
        const nameOrPath = item.data.label;

        const hits = requests.filter(req => {
            if (req.handlerStack && req.handlerStack.some((h: any) =>
                h.name === nameOrPath ||
                (item.data.endpoints && item.data.endpoints.some((e: any) => e.path === h.name))
            )) return true;

            // Route matching fallback
            if (kind === 'route' || kind === 'router') {
                if (nameOrPath && req.url && req.url.includes(nameOrPath)) return true;
            }
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

        const row = (label: string, value: string | number, valueClass?: string) =>
            `<div class="tt-row"><span>${label}</span><span${valueClass ? ` class="${valueClass}"` : ''}>${value}</span></div>`;

        const valueClassFor = (val: number, thresholds: { warn: number; danger: number }) => {
            if (val >= thresholds.danger) return 'tt-value-danger';
            if (val >= thresholds.warn) return 'tt-value-warning';
            return 'tt-value-success';
        };

        const gridItem = (label: string, value: string) =>
            `<div class="tt-grid-item"><span class="tt-label">${label}</span><span class="tt-value">${value}</span></div>`;

        const statusBadges = Object.keys(stats.statusCodes).map(code => {
            const statusNum = parseInt(code, 10);
            const isError = statusNum >= 400;
            const isSuccess = statusNum >= 200 && statusNum < 300;
            const colorClass = isError ? 'tt-value-danger' : isSuccess ? 'tt-value-success' : 'tt-value-info';
            return `<span class="tt-status-badge ${colorClass}">${code}: ${stats.statusCodes[code]}</span>`;
        }).join('');

        return `<div class="tt-body">
                <div class="tt-section">
                    <div class="tt-header">Metrics</div>
                    ${row('Requests', stats.requests, 'tt-value-info')}
                    ${row('Traffic', stats.trafficPercent + '%', stats.trafficPercent > 50 ? 'tt-value-success' : undefined)}
                    ${row('Failures', stats.failures, stats.failures > 0 ? 'tt-value-danger' : undefined)}
                </div>
                <div class="tt-section">
                    <div class="tt-header">Response Times</div>
                    <div class="tt-grid">
                        ${gridItem('min', stats.p1 + 'ms')}
                        ${gridItem('p50', stats.p50 + 'ms')}
                        ${gridItem('p99', stats.p99 + 'ms')}
                    </div>
                </div>
                ${statusBadges ? `<div class="tt-divider"></div><div class="tt-status-codes">${statusBadges}</div>` : ''}
            </div>`;
    }
}

