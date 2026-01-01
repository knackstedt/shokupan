import { Background, Controls, Handle, ReactFlow, useEdgesState, useNodesState } from 'https://esm.sh/@xyflow/react@12.3.6?deps=react@18.3.1,react-dom@18.3.1';
import ELK from 'https://esm.sh/elkjs@0.9.3/lib/elk.bundled.js';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1';
import React, { useEffect, useState } from 'https://esm.sh/react@18.3.1';

const elk = new ELK();

const NODE_STYLES = {
    app: { background: 'rgba(59, 130, 246, 0.1)', color: '#fff', border: '2px solid #3b82f6', borderRadius: '4px', fontWeight: 'bold' },
    router: { background: 'rgba(30, 41, 59, 0.5)', color: '#f8fafc', border: '2px dashed #475569', borderRadius: '8px' },
    controller: { background: 'rgba(124, 58, 237, 0.1)', color: '#a78bfa', border: '1px solid #7c3aed', borderRadius: '6px' },
    middleware: { background: '#7e22ce', color: '#fff', border: '1px solid #6b21a8', borderRadius: '12px', padding: '6px 12px', fontSize: '10px' }
};

const GroupNode = ({ data }) => {
    return React.createElement('div', { style: { padding: '10px', height: '100%' } },
        React.createElement('div', { style: { fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '5px', marginBottom: '5px' } },
            data.label
        ),
        data.routes && data.routes.map((r, i) =>
            React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', margin: '2px 0' } },
                React.createElement('span', {
                    style: {
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#0f172a',
                        border: `1px solid ${r.method === 'GET' ? '#3b82f6' :
                            r.method === 'POST' ? '#22c55e' :
                                r.method === 'PUT' ? '#eab308' :
                                    r.method === 'DELETE' ? '#ef4444' : '#64748b'
                            }`,
                        color: r.method === 'GET' ? '#3b82f6' :
                            r.method === 'POST' ? '#22c55e' :
                                r.method === 'PUT' ? '#eab308' :
                                    r.method === 'DELETE' ? '#ef4444' : '#f8fafc',
                        fontWeight: 'bold',
                        fontSize: '10px',
                        minWidth: '40px',
                        textAlign: 'center'
                    }
                }, r.method),
                React.createElement('span', { style: { fontFamily: 'monospace', color: r.isFailed ? '#ef4444' : '#cbd5e1', fontWeight: r.isFailed ? 'bold' : 'normal' } }, r.path)
            )
        ),
        React.createElement(Handle, { type: 'target', position: 'top' }),
        React.createElement(Handle, { type: 'source', position: 'bottom' })
    );
};

const nodeTypes = {
    controller: GroupNode,
    router: GroupNode
};

const GraphComponent = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Search Filter
    useEffect(() => {
        if (!searchTerm) {
            setNodes(nds => nds.map(node => ({ ...node, style: { ...node.style, opacity: 1 } })));
            setEdges(eds => eds.map(edge => ({ ...edge, style: { ...edge.style, opacity: 1 } })));
            return;
        }

        const query = searchTerm.toLowerCase();
        const matchedIds = new Set();

        // Find matches in labels OR in internal routes
        nodes.forEach(node => {
            const labelMatch = node.data.label && node.data.label.toLowerCase().includes(query);
            const routeMatch = node.data.routes && node.data.routes.some(r => r.path.toLowerCase().includes(query));

            if (labelMatch || routeMatch) matchedIds.add(node.id);
        });

        setNodes(nds => nds.map(node => ({
            ...node,
            style: { ...node.style, opacity: matchedIds.has(node.id) ? 1 : 0.1 }
        })));

        setEdges(eds => eds.map(edge => ({
            ...edge,
            style: { ...edge.style, opacity: 0.1 }
        })));

    }, [searchTerm]);


    useEffect(() => {
        const buildGraph = async () => {
            const registryData = window.registryData;
            if (!registryData) return;

            const elkEdges = [];
            const makeId = (type, parent, idx, name) => `${type}_${parent || 'root'}_${idx}_${name.replace(/[^a-zA-Z0-9]/g, '')}`;

            function getNodeStyle(id) {
                const m = window.metrics?.nodeMetrics && window.metrics.nodeMetrics[id];
                if (!m) return {};
                if (m.failures > 0) {
                    // Red intensity based on failures
                    const intensity = Math.min(1, m.failures / 5);
                    return { backgroundColor: `rgba(239, 68, 68, ${0.2 + intensity * 0.8})`, color: 'white' };
                }
                return {};
            }

            function buildHierarchy(node, currentId) {
                if (!node) return null;
                const children = [];
                let previousNodeId = null;

                // 1. Process Middleware (Chain them sequentially)
                let lastMiddlewareId = null;

                if (node.middleware) {
                    node.middleware.forEach((mw, idx) => {
                        const id = mw.id || makeId('mw', currentId, idx, mw.name);
                        const label = mw.name + (mw.metadata?.pluginName ? `\n[${mw.metadata.pluginName}]` : '');
                        children.push({
                            id,
                            width: 140,
                            height: 40,
                            labels: [{ text: label }],
                            type: 'middleware',
                            style: getNodeStyle(id)
                        });

                        if (lastMiddlewareId) {
                            elkEdges.push({ id: `e_${lastMiddlewareId}_${id}`, sources: [lastMiddlewareId], targets: [id] });
                        }
                        lastMiddlewareId = id;
                    });
                }

                // Use the last middleware as the source for all downstream components (controllers/routers)
                const upstreamSourceId = lastMiddlewareId;

                // Map to store controller group nodes by name
                const controllerGroups = new Map();

                // 2. Create Controller Containers (Now Compact Nodes)
                if (node.controllers) {
                    node.controllers.forEach((ctrl, idx) => {
                        const id = ctrl.id || makeId('ctrl', currentId, idx, ctrl.name);
                        const ctrlNode = {
                            id,
                            labels: [{ text: ctrl.name }],
                            type: 'controller',
                            width: 200,
                            height: 100,
                            children: [],
                            style: getNodeStyle(id),
                            routes: [],
                            layoutOptions: {
                                'elk.direction': 'DOWN'
                            }
                        };
                        controllerGroups.set(ctrl.name, ctrlNode);
                        children.push(ctrlNode);

                        // Edge from Middleware (if any)
                        if (upstreamSourceId) {
                            elkEdges.push({ id: `e_${upstreamSourceId}_${id}`, sources: [upstreamSourceId], targets: [id] });
                        }
                    });
                }

                // 3. Process Routes (Collect into Controllers or Routers)
                // If a route doesn't belong to a controller, we might need a "Misc Routes" node or just list it in parent router?
                // For now, let's attach to parent router if no controller, or create a 'Routes' node.

                // We need a place to put loose routes (not in a controller)
                // Let's create a 'RouterRoutes' node if there are any loose routes
                const looseRoutes = [];

                if (node.routes) {
                    node.routes.forEach((route, idx) => {
                        let placed = false;
                        if (route.tags) {
                            for (const tag of route.tags) {
                                if (controllerGroups.has(tag)) {
                                    const m = window.metrics?.nodeMetrics && window.metrics.nodeMetrics[route.id];
                                    const isFailed = m && m.failures > 0;

                                    controllerGroups.get(tag).routes.push({ method: route.method, path: route.path, isFailed });

                                    // Dynamic Sizing
                                    const group = controllerGroups.get(tag);
                                    // Estimate width: Base 20 + approx 8px per char for longest string (method + space + path)
                                    // Method badge is ~50px width.
                                    const longestRoute = group.routes.reduce((max, r) => Math.max(max, (r.method.length + r.path.length + 1)), 0);
                                    // Char width estimate (monospace roughly 7-8px) + badge (50px) + padding (30px)
                                    const calculatedWidth = 50 + (longestRoute * 8) + 40;

                                    group.width = Math.max(300, calculatedWidth); // Min 300px
                                    group.height = 50 + (group.routes.length * 30); // 30px per row

                                    placed = true;
                                    break;
                                }
                            }
                        }

                        if (!placed) {
                            looseRoutes.push(route);
                        }
                    });
                }

                // If there are loose routes, we can display them in the Router node itself?
                // But Router node is currently a container. 
                // Let's make the Router node ALSO custom and capable of showing routes?
                // Yes, 'router' type is now GroupNode too.
                const routerRoutes = looseRoutes.map(r => ({ method: r.method, path: r.path }));

                // 4. Process Child Routers
                if (node.routers) {
                    node.routers.forEach((router, idx) => {
                        const id = router.id || makeId('router', currentId, idx, router.path);
                        const childResult = buildHierarchy(router.children, id);

                        // Router Node (Compact + Container)
                        // It can have children (sub-routers, controllers) AND its own routes
                        const routerNode = {
                            id,
                            labels: [{ text: router.path }],
                            type: 'router',
                            // Own routes
                            routes: [], // Will be populated by childResult logic if we structured differently?
                            // Actually, buildHierarchy processes the *contents* of the router.
                            // The current `node.routers` iteration creates the wrapper.
                            // We can't easily peek inside `router.children` here to pull routes up, 
                            // unless we change signature. 
                            // BUT, `childResult` contains the children nodes.

                            children: childResult ? childResult.children : [],

                            layoutOptions: {
                                'elk.padding': '[top=40,left=20,bottom=20,right=20]',
                                'elk.direction': 'DOWN',
                                'elk.algorithm': 'layered',
                                'elk.hierarchyHandling': 'INCLUDE_CHILDREN'
                            }
                        };

                        if (childResult && childResult.ownRoutes && childResult.ownRoutes.length > 0) {
                            routerNode.routes = childResult.ownRoutes;

                            // Dynamic Sizing for Router Nodes
                            const longestRoute = routerNode.routes.reduce((max, r) => Math.max(max, (r.method.length + r.path.length + 1)), 0);
                            const calculatedWidth = 50 + (longestRoute * 8) + 40;
                            routerNode.width = Math.max(300, calculatedWidth);
                        }

                        children.push(routerNode);

                        // Edge from Middleware (if any)
                        if (upstreamSourceId) {
                            elkEdges.push({ id: `e_${upstreamSourceId}_${id}`, sources: [upstreamSourceId], targets: [id] });
                        }
                    });
                }

                return { children, ownRoutes: routerRoutes };
            }

            const rootData = buildHierarchy(registryData, 'root');

            console.log({ elkEdges });

            const graph = {
                id: 'root',
                layoutOptions: {
                    'elk.algorithm': 'layered',
                    'elk.direction': 'DOWN',
                    'elk.padding': '[top=50,left=50,bottom=50,right=50]',
                    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
                    'elk.spacing.nodeNode': '40',
                    'elk.layered.spacing.nodeNodeBetweenLayers': '50'
                },
                children: [
                    {
                        id: 'app_container',
                        type: 'app',
                        labels: [{ text: 'Application' }],
                        children: rootData.children,
                        // If root has routes, we need to show them. rootData.ownRoutes
                        // We can add a "Root Routes" node if needed.
                        layoutOptions: { 'elk.padding': '[top=50,left=20,bottom=150,right=20]' }
                    }
                ],
                edges: elkEdges
            };

            // Add root routes if any
            if (rootData.ownRoutes && rootData.ownRoutes.length > 0) {
                graph.children[0].children.unshift({
                    id: 'root_routes',
                    type: 'router', // Reuse style
                    labels: [{ text: 'Root Routes' }],
                    routes: rootData.ownRoutes,
                    width: 300,
                    height: 40 + (rootData.ownRoutes.length * 25)
                });
            }

            try {
                console.log("Starting ELK layout with graph:", JSON.stringify(graph, (k, v) => k === 'parent' ? undefined : v, 2));
                const layoutedGraph = await elk.layout(graph);
                console.log("ELK layout success");

                const flowNodes = [];

                const processLayoutedNode = (node, parentId = undefined) => {
                    if (node.id === 'root') {
                        node.children?.forEach(c => processLayoutedNode(c));
                        return;
                    }

                    const style = NODE_STYLES[node.type] || {};
                    const isGroup = node.children && node.children.length > 0;

                    flowNodes.push({
                        id: node.id,
                        position: { x: node.x, y: node.y },
                        data: {
                            label: node.labels?.[0]?.text,
                            routes: node.routes // Pass routes to custom node
                        },
                        style: {
                            ...style,
                            width: node.width,
                            height: node.height,
                            zIndex: isGroup ? -1 : 1
                        },
                        type: node.type === 'controller' || node.type === 'router' ? node.type : 'default',
                        parentNode: parentId,
                        draggable: false,
                        extent: 'parent'
                    });

                    if (node.children) {
                        node.children.forEach(c => processLayoutedNode(c, node.id));
                    }
                };

                processLayoutedNode(layoutedGraph);

                const flowEdges = elkEdges.map(e => ({
                    id: e.id,
                    source: e.sources[0],
                    target: e.targets[0],
                    type: 'smoothstep',
                    animated: true,
                    style: { stroke: '#475569', strokeWidth: 2 }
                }));

                setNodes(flowNodes);
                setEdges(flowEdges);

            } catch (e) {
                console.error("ELK Layout Error", e);
                // Fallback UI
                const errorNode = {
                    id: 'error',
                    position: { x: 50, y: 50 },
                    data: { label: 'Graph Layout Failed: ' + e.message },
                    style: { color: 'red', border: '1px solid red', padding: '10px' }
                };
                setNodes([errorNode]);
            } finally {
                setLoading(false);
            }
        };

        buildGraph();
    }, []);

    if (loading) return React.createElement('div', { style: { color: '#fff', padding: '20px' } }, 'Laying out graph...');

    return React.createElement(ReactFlow, {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        nodeTypes, // Register custom types
        fitView: true,
        minZoom: 0.1,
    },
        React.createElement(Background, { color: '#334155', gap: 16 }),
        React.createElement(Controls)
    );
};

function mountReact() {
    const container = document.getElementById('cy');
    if (container && !container._reactRoot) {
        const root = createRoot(container);
        container._reactRoot = root;
        root.render(React.createElement(GraphComponent));
    }
}
window.initGraph = mountReact;

