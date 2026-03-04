import fs from 'fs';
const rootContext = JSON.parse(fs.readFileSync('registry.json', 'utf8')).registry;
const newNodes: any[] = [];
const newEdges: any[] = [];
const processContext = (ctx: any, parentId?: string, forcedKind?: string) => {
    if (!ctx) return;
    const ctxId = ctx.id || ctx.name || ctx.path || 'root';
    const kind = ctx.kind || forcedKind || (ctx === rootContext ? 'router' : 'unknown');
    if (kind !== 'route') {
        newNodes.push({ id: ctxId, width: 380, height: 100 });
        if (parentId && parentId !== ctxId) {
            newEdges.push({ id: `e-${parentId}-${ctxId}`, source: parentId, target: ctxId });
        }
    }
    const collections: Record<string, string> = {
        'middleware': 'middleware', 'events': 'event', 'controllers': 'controller', 'routers': 'router'
    };
    Object.entries(collections).forEach(([collectionName, childKind]) => {
        const collection = ctx[collectionName] || ctx.children?.[collectionName];
        if (Array.isArray(collection)) {
            collection.forEach((child: any) => { processContext(child, ctxId, childKind); });
        }
    });
};
processContext(rootContext, undefined, 'router');

import ELK from 'elkjs/lib/elk.bundled.js';
const elk = new ELK();
const graph: any = {
    id: "root",
    layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '80',
        'elk.layered.spacing.nodeNodeBetweenLayers': '180'
    },
    children: newNodes.map(n => ({ id: n.id, width: n.width, height: n.height })),
    edges: newEdges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))
};
elk.layout(graph).then(laidOut => {
    console.log("elk Node 0:", laidOut.children[0]);
});
