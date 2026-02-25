import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, Inject, Input, PLATFORM_ID, signal, ViewEncapsulation } from '@angular/core';

// ngx-xyflow features
import { XYFlowModule } from 'ngx-xyflow';

export interface Node {
    id: string;
    type?: string;
    data: any;
    position: { x: number; y: number; };
    style?: any;
    width?: number;
    height?: number;
}
export interface Edge {
    id: string;
    source: string;
    target: string;
    type?: string;
    markerEnd?: any;
    style?: any;
}

// elkjs logic
import ELK from 'elkjs/lib/elk.bundled.js';

@Component({
    selector: 'skp-app-graph',
    standalone: true,
    imports: [
        CommonModule,
        XYFlowModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    templateUrl: './app-graph.component.html',
    styleUrl: './app-graph.component.scss',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppGraphComponent {
    private isBrowser: boolean;

    @Input() set rawData(value: any) {
        if (value && this.isBrowser) {
            this.generateGraph(value);
        }
    }

    nodes = signal<Node[]>([]);
    edges = signal<Edge[]>([]);

    readonly fitView = signal(true);

    constructor(@Inject(PLATFORM_ID) platformId: Object) {
        this.isBrowser = isPlatformBrowser(platformId);
    }

    private async generateGraph(rootContext: any) {
        if (!this.isBrowser) return;

        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        // Build the nodes from the deeply nested context.
        // This is a simplified transformation similar to the legacy logic.
        const processContext = (ctx: any, parentId?: string, forcedKind?: string) => {
            if (!ctx) return;

            const ctxId = ctx.id || ctx.name || 'root';
            const kind = ctx.kind || forcedKind || (ctx === rootContext ? 'global' : 'unknown');

            if (kind && kind !== 'global') {
                // create a node
                const label = ctx.name || ctx.path || kind;
                newNodes.push({
                    id: ctxId,
                    type: 'default',
                    data: { label: `${kind.toUpperCase()}: ${label}` },
                    position: { x: 0, y: 0 },
                    style: {
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '10px',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        fontSize: '12px'
                    }
                });

                if (parentId && parentId !== ctxId) {
                    newEdges.push({
                        id: `e-${parentId}-${ctxId}`,
                        source: parentId,
                        target: ctxId,
                        type: 'smoothstep',
                        markerEnd: { type: 'arrowclosed', color: '#a8a29e' },
                        style: { stroke: '#a8a29e', strokeWidth: 1.5 }
                    });
                }
            }

            const collections: Record<string, string> = {
                'middleware': 'middleware',
                'routes': 'route',
                'events': 'event',
                'controllers': 'controller',
                'routers': 'router'
            };

            Object.entries(collections).forEach(([collectionName, childKind]) => {
                if (Array.isArray(ctx[collectionName])) {
                    ctx[collectionName].forEach((child: any) => {
                        processContext(child, kind === 'global' ? undefined : ctxId, childKind);
                    });
                }
            });

            if (Array.isArray(ctx.children)) {
                ctx.children.forEach((child: any) => {
                    processContext(child, kind === 'global' ? undefined : ctxId, 'child');
                });
            }
        };

        processContext(rootContext, undefined, 'global');

        try {
            const layouted = await this.applyElkLayout(newNodes, newEdges);
            this.nodes.set(layouted.nodes);
            this.edges.set(layouted.edges);
        } catch (e) {
            console.error("ELK structure failed:", e);
            // Fallback to unstructured dump
            this.nodes.set(newNodes);
            this.edges.set(newEdges);
        }
    }

    private async applyElkLayout(nodes: Node[], edges: Edge[]) {
        const elk = new ELK();
        const graph: any = {
            id: "root",
            layoutOptions: {
                'elk.algorithm': 'layered',
                'elk.direction': 'RIGHT',
                'elk.spacing.nodeNode': '40',
                'elk.layered.spacing.nodeNodeBetweenLayers': '60'
            },
            children: nodes.map(n => ({ id: n.id, width: 200, height: 40 })), // Approximate sizes
            edges: edges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))
        };

        const laidOut = await elk.layout(graph);

        return {
            nodes: nodes.map(n => {
                const elkNode = laidOut.children?.find((c: any) => c.id === n.id);
                if (elkNode) {
                    return { ...n, position: { x: elkNode.x || 0, y: elkNode.y || 0 } };
                }
                return n;
            }),
            edges
        };
    }
}
