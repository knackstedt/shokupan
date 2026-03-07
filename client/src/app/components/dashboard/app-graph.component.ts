import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, Inject, Input, PLATFORM_ID, signal, ViewChild, ViewEncapsulation } from '@angular/core';

// ngx-vflow features
import { createEdges, createNodes, Edge, Node, Vflow, VflowComponent } from 'ngx-vflow';
import { TooltipModule } from 'primeng/tooltip';

// elkjs logic
import ELK from 'elkjs/lib/elk.bundled.js';

@Component({
    selector: 'skp-app-graph',
    standalone: true,
    imports: [
        CommonModule,
        Vflow,
        TooltipModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    templateUrl: './app-graph.component.html',
    styleUrl: './app-graph.component.scss',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppGraphComponent {
    private isBrowser: boolean;

    @ViewChild(VflowComponent) vflowComponent!: VflowComponent;

    @Input() set rawData(value: any) {
        if (value && this.isBrowser) {
            this.generateGraph(value);
        }
    }
    @Input() metrics: any = {};
    @Input() requests: any[] = [];

    nodes = signal<Node[]>([]);
    edges = signal<Edge[]>([]);

    readonly fitView = signal(false);

    constructor(@Inject(PLATFORM_ID) platformId: Object) {
        this.isBrowser = isPlatformBrowser(platformId);
    }

    private customSmoothStep = (params: any) => {
        const p1 = params.sourcePoint;
        const p2 = params.targetPoint;
        const radius = 30; // Increased radius for smoother curves

        const midY = (p1.y + p2.y) / 2;
        const diffX = Math.abs(p1.x - p2.x);
        const dirX = p1.x < p2.x ? 1 : -1;

        let path = '';
        if (diffX < 2) {
            path = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
        } else {
            const r = Math.min(radius, diffX / 2, Math.abs(p2.y - p1.y) / 2);
            path = `M ${p1.x} ${p1.y} L ${p1.x} ${midY - r} Q ${p1.x} ${midY} ${p1.x + dirX * r} ${midY} L ${p2.x - dirX * r} ${midY} Q ${p2.x} ${midY} ${p2.x} ${midY + r} L ${p2.x} ${p2.y}`;
        }

        return { path };
    };

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
                const calculatedHeight = 52 + (endpoints.length ? 16 + (endpoints.length * 36) : 0);
                newNodes.push({
                    id: ctxId,
                    type: 'html-template',
                    data: { kind, label, endpoints, nodeHeight: calculatedHeight },
                    point: { x: 0, y: 0 },
                    width: 380,
                    height: calculatedHeight, // Base height + padding + (rows * rowHeight)
                });
            }

            // Handle middleware interception
            const mwArray = isRootEntry ? [] : (ctx.middleware || ctx.children?.middleware || []);
            if (mwArray.length > 0 && kind !== 'middleware') {
                let prevSourceId = incomingSourceId;

                mwArray.forEach((mw: any, idx: number) => {
                    const mwId = mw.id || `${ctxId}-mw-${idx}-${mw.name || 'unnamed'}`;
                    newNodes.push({
                        id: mwId,
                        type: 'html-template',
                        data: { kind: 'middleware', label: mw.name || 'Middleware', endpoints: [], nodeHeight: 44 },
                        point: { x: 0, y: 0 },
                        width: 380, // Matched with standard nodes to guarantee strict column alignment
                        height: 44,
                    });

                    if (prevSourceId) {
                        newEdges.push({
                            id: `e-${prevSourceId}-${mwId}`,
                            source: prevSourceId,
                            target: mwId,
                            sourceHandle: 'bottom',
                            targetHandle: 'top',
                            type: 'default',
                            curve: this.customSmoothStep,
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
                        sourceHandle: 'bottom',
                        targetHandle: 'top',
                        type: 'default',
                        curve: this.customSmoothStep,
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
                    sourceHandle: 'bottom',
                    targetHandle: 'top',
                    type: 'default',
                    curve: this.customSmoothStep,
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
        const entryCalculatedHeight = 52 + (entryEndpoints.length ? 16 + (entryEndpoints.length * 36) : 0);
        newNodes.push({
            id: entryId,
            type: 'html-template',
            data: { kind: 'entrypoint', label: 'HTTP Request', endpoints: entryEndpoints, nodeHeight: entryCalculatedHeight },
            point: { x: 0, y: 0 },
            width: 380,
            height: entryCalculatedHeight,
        });

        processContext(rootContext, entryId, 'router', true);

        console.log("NODES:", newNodes.map((n: any) => n.id)); console.log("EDGES:", newEdges.map((e: any) => e.source + " -> " + e.target)); try {
            const layouted = await this.applyElkLayout(newNodes, newEdges);
            this.nodes.set(createNodes(layouted.nodes));
            this.edges.set(createEdges(layouted.edges));

            setTimeout(() => {
                if (this.vflowComponent) {
                    this.vflowComponent.fitView({ padding: 0.1, duration: 500 });
                }
            }, 250);
        } catch (e) {
            console.error("ELK structure failed:", e);
            // Fallback to unstructured dump
            this.nodes.set(createNodes(newNodes));
            this.edges.set(createEdges(newEdges));
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
                'elk.direction': 'DOWN',
                'elk.spacing.nodeNode': '80', // strictly 80px between nodes
                'elk.layered.spacing.nodeNodeBetweenLayers': '90',
                'elk.spacing.edgeNode': '40',
                'elk.layered.spacing.edgeEdgeBetweenLayers': '40',
                'elk.layered.spacing.edgeNodeBetweenLayers': '40',
                'elk.layered.wrapping.additionalEdgeSpacing': '40',
                'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
                'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED'
            },
            children: nodes.map(n => ({ id: n.id, width: n.width || 380, height: n.height || 40 })),
            edges: edges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))
        };

        const laidOut = await elk.layout(graph);

        return {
            nodes: nodes.map(n => {
                const elkNode = laidOut.children?.find((c: any) => c.id === n.id);
                if (elkNode) {
                    return { ...n, point: { x: elkNode.x || 0, y: elkNode.y || 0 } };
                }
                return n;
            }),
            edges
        };
    }

    /**
     * Highlights :params, * wildcards, .well-known segments in the path.
     * Returns an HTML string safe for [innerHTML].
     */
    highlightPath(path: string | undefined): string {
        if (!path) return '';
        return path.split('/').map((seg, i) => {
            if (!seg) return i === 0 ? '' : '';      // empty (leading slash)
            if (seg.startsWith(':')) {
                return `<span class="path-param">${escHtml(seg)}</span>`;
            }
            if (seg === '*' || seg === '**') {
                return `<span class="path-wildcard">${escHtml(seg)}</span>`;
            }
            if (seg.startsWith('.')) {
                return `<span class="path-dotfile">${escHtml(seg)}</span>`;
            }
            return escHtml(seg);
        }).join('<span class="path-sep">/</span>');
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

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
