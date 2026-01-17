import { Background, Controls, Handle, MarkerType, ReactFlow, useEdgesState, useNodesState } from 'https://esm.sh/@xyflow/react@12.3.6?deps=react@18.3.1,react-dom@18.3.1';
import ELK from 'https://esm.sh/elkjs@0.9.3/lib/elk.bundled.js';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client?deps=react@18.3.1';
import React, { useEffect, useState } from 'https://esm.sh/react@18.3.1';

const elk = new ELK();

const NODE_STYLES = {
    router: { background: '#22c58a10', color: '#22c58a', border: '1px solid #22c58a', borderRadius: '8px' },
    controller: { background: 'rgba(124, 58, 237, 0.1)', color: '#a78bfa', border: '1px solid #0a090aff', borderRadius: '6px' },
    middleware: { background: '#7e22ce', color: '#fff', border: '1px solid #6b21a8', borderRadius: '9px', padding: '6px 12px', fontSize: '10px' },
    entrypoint: { background: '#3b82f6', color: '#fff', border: '1px solid #306cce', borderRadius: '12px', padding: '' }
};


function renderPath(path) {
    const parts = path.split('/').slice(1);

    let out = '';
    parts.forEach((part, index) => {
        if (part === '.well-known') {
            out += `/<span class="path-segment" style="color: #8b5cf6; font-weight: bold;">${part}</span>`;
            return;
        }
        if (part.startsWith(":")) {
            out += `/<span class="path-segment path-param">${part}</span>`;
            return;
        }
        if (index === parts.length - 1) {
            out += `/<span class="path-segment path-end">${part}</span>`;
            return;
        };
        out += `/<span class="path-segment">${part}</span>`;
    });

    return out;
}

const GroupNode = ({ data }) => {
    return React.createElement('div', { style: { padding: '10px', height: '100%' } },
        React.createElement('div', { style: { fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '5px', marginBottom: '5px' } },
            data.type === "controller" ? data.label : (data.data.metadata?.pluginName ? data.label : "Router: " + data.label)
        ),
        data.data?.children?.routes?.map((r, i) =>
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
                React.createElement('span', {
                    style: { fontFamily: 'monospace', color: r.isFailed ? '#ef4444' : '#cbd5e1', fontWeight: r.isFailed ? 'bold' : 'normal' },
                    dangerouslySetInnerHTML: { __html: renderPath(r.path) }
                })
            )
        ),
        React.createElement(Handle, { type: 'target', position: 'top' }),
        React.createElement(Handle, { type: 'source', position: 'bottom' })
    );
};

const EntrypointNode = ({ data }) => {
    return React.createElement('div', { style: { padding: '10px', height: '100%' } },
        React.createElement(
            "svg",
            {
                height: "100%",
                width: "100%",
                version: "1.1",
                xmlns: "http://www.w3.org/2000/svg",
                xmlnsXlink: "http://www.w3.org/1999/xlink",
                viewBox: "0 0 512 512",
                xmlSpace: "preserve",
            },
            React.createElement(
                "style",
                { type: "text/css" },
                ".st0{fill:currentColor;}"
            ),
            React.createElement(
                "g",
                null,
                React.createElement("path", {
                    className: "st0",
                    d: "M255.994,0.006C114.607,0.013,0.012,114.612,0,256c0.012,141.387,114.607,255.986,255.994,255.994 C397.393,511.986,511.992,397.387,512,256C511.992,114.612,397.393,0.013,255.994,0.006z M97.607,97.612 c23.34-23.328,51.761-41.475,83.455-52.725c-15.183,18.375-27.84,41.906-37.757,69.116H82.772 C87.452,108.308,92.396,102.824,97.607,97.612z M65.612,138.003h69.986c-9.008,31.929-14.41,67.834-15.363,105.997H32.327 C34.374,205.196,46.3,169.088,65.612,138.003z M65.612,373.997C46.3,342.912,34.374,306.804,32.327,268h87.991 c0.961,38.124,6.21,74.092,15.206,105.998H65.612z M97.607,414.386c-5.211-5.211-10.156-10.695-14.836-16.39h60.573 c4.28,11.774,9.019,22.944,14.312,33.21c6.954,13.438,14.758,25.468,23.348,35.89C149.332,455.846,120.931,437.699,97.607,414.386z M243.998,479.667c-3.746-0.196-7.469-0.477-11.164-0.86c-5.89-2.64-11.722-6.25-17.5-10.961 c-17.632-14.359-33.976-38.671-46.398-69.85h75.061V479.667z M243.998,373.997h-83.436c-9.477-31.171-15.316-67.311-16.328-105.998 h99.763V373.997z M243.998,244H144.31c1.008-38.71,6.875-74.819,16.359-105.997h83.33V244z M243.998,114.003h-74.951 c3.109-7.79,6.367-15.312,9.934-22.195c10.64-20.625,23.17-36.89,36.354-47.656c5.777-4.71,11.609-8.32,17.5-10.96 c3.695-0.382,7.417-0.664,11.164-0.859V114.003z M446.392,138.003c19.312,31.085,31.234,67.194,33.281,105.997h-87.991 c-0.961-38.124-6.21-74.092-15.21-105.997H446.392z M414.393,97.612c5.211,5.211,10.156,10.696,14.836,16.391h-60.577 c-4.281-11.773-9.023-22.945-14.312-33.21c-6.953-13.437-14.758-25.468-23.347-35.89C362.668,56.16,391.065,74.301,414.393,97.612z M267.998,32.333c3.746,0.195,7.469,0.484,11.16,0.859c5.89,2.649,11.723,6.25,17.504,10.96 c17.636,14.359,33.976,38.671,46.397,69.85h-75.061V32.333z M267.998,138.003h83.436c9.476,31.171,15.32,67.31,16.328,105.997 h-99.764V138.003z M267.998,268h99.685c-1.007,38.71-6.874,74.818-16.359,105.998h-83.326V268z M296.661,467.846 c-5.781,4.711-11.614,8.313-17.504,10.961c-3.691,0.375-7.414,0.664-11.16,0.86v-81.67h74.951 c-3.109,7.789-6.367,15.312-9.933,22.195C322.376,440.816,309.845,457.081,296.661,467.846z M414.393,414.386 c-23.336,23.328-51.764,41.476-83.459,52.725c15.187-18.375,27.835-41.905,37.757-69.115h60.538 C424.548,403.692,419.604,409.176,414.393,414.386z M446.392,373.997h-69.998c9.008-31.929,14.414-67.842,15.367-105.998h87.912 C477.626,306.804,465.704,342.912,446.392,373.997z",
                })
            )
        ),
        React.createElement(Handle, { type: 'source', position: 'bottom' })
    );
};

const MiddlewareNode = ({ data }) => {
    return React.createElement('div', { style: { padding: '10px', height: '100%' } },
        React.createElement('div', { style: { fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '5px', marginBottom: '5px' } },
            data.label
        ),
        React.createElement(Handle, { type: 'target', position: 'top' }),
        React.createElement(Handle, { type: 'source', position: 'bottom' })
    );
};

const nodeTypes = {
    controller: GroupNode,
    router: GroupNode,
    middleware: MiddlewareNode,
    entrypoint: EntrypointNode
};

const GraphComponent = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [zoom, setZoom] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);

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

            const makeId = (type, parent, idx, name) => `${type}_${parent || 'root'}_${idx}_${(name || '').replace(/[^a-zA-Z0-9]/g, '')}`;

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
            function getEdgeStyle(item) {
                return {

                };
            }

            function calculateNodeBounds(container) {
                const routes = container.children?.routes || [];

                // Create a temporary container that matches GroupNode styling
                const wrapper = document.createElement("div");
                wrapper.style.visibility = "hidden";
                wrapper.style.position = "absolute";
                wrapper.style.width = "fit-content";
                wrapper.style.maxWidth = "500px"; // Arbitrary max width
                document.body.appendChild(wrapper);

                // Mimic GroupNode container
                const nodeEl = document.createElement("div");
                nodeEl.style.padding = "10px";
                nodeEl.style.fontFamily = "Inter, system-ui, sans-serif"; // App font
                nodeEl.style.fontSize = "12px";
                wrapper.appendChild(nodeEl);

                // Mimic Header
                const header = document.createElement("div");
                header.style.fontWeight = "bold";
                header.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
                header.style.paddingBottom = "5px";
                header.style.marginBottom = "5px";
                // Label logic matches GroupNode
                header.textContent = container.type === "controller"
                    ? (container.name + (container.metadata?.pluginName ? `\n[${container.metadata.pluginName}]` : ''))
                    : (container.metadata?.pluginName ? `[${container.metadata.pluginName}]` : "Router: " + container.path);
                nodeEl.appendChild(header);

                // Mimic Routes
                for (const route of routes) {
                    const row = document.createElement("div");
                    row.style.display = "flex";
                    row.style.alignItems = "center";
                    row.style.gap = "8px";
                    row.style.margin = "2px 0";

                    const badge = document.createElement("span");
                    badge.textContent = route.method;
                    badge.style.padding = "2px 6px";
                    badge.style.fontSize = "10px";
                    badge.style.fontWeight = "bold";
                    row.appendChild(badge);

                    const path = document.createElement("span");
                    path.textContent = route.path;
                    path.style.fontFamily = "monospace";
                    // path.style.color... doesn't affect size
                    row.appendChild(path);

                    nodeEl.appendChild(row);
                }

                const rect = nodeEl.getBoundingClientRect();
                const width = Math.ceil(rect.width) + 20; // Safety buffer
                const height = Math.ceil(rect.height);

                document.body.removeChild(wrapper);

                return { width, height };
            }

            function addRecursedLevel({ middleware, routes, routers, controllers }, parentId) {
                const restChildrenNodes = [];
                const restChildrenEdges = [];

                const elkEdges = [];
                const elkNodes = [
                    ...(middleware || []).map((mw, idx) => {
                        const id = makeId("middleware", parentId, idx, mw.name);
                        return {
                            id,
                            label: mw.metadata?.pluginName || mw.name || "Unknown Middleware",
                            ...calculateNodeBounds(mw),
                            // width: 140,
                            // height: 40,
                            type: "middleware",
                            style: getNodeStyle(id),
                            data: mw
                        };
                    }),
                    ...(routers || []).map((r, idx) => {
                        const id = makeId("router", parentId, idx, r.path);
                        const { nodes, edges } = addRecursedLevel(r.children, id);
                        restChildrenNodes.push(...nodes);
                        restChildrenEdges.push(...edges);

                        const isPlugin = r.metadata?.pluginName;
                        const label = isPlugin
                            ? `[${r.metadata.pluginName}]`
                            : r.path;

                        const baseStyle = getNodeStyle(id);
                        const routerStyle = isPlugin
                            ? {
                                ...baseStyle,
                                background: '#f59e0b10',
                                color: '#f59e0b',
                                border: '1px solid #f59e0b'
                            }
                            : {
                                ...baseStyle
                                // Use default router style from NODE_STYLES via class/type mapping later?
                                // Actually NODE_STYLES handles 'router'. We should NOT override it with 'red' here.
                            };

                        return {
                            id,
                            label: label,
                            ...calculateNodeBounds(r),
                            type: "router",
                            style: routerStyle,
                            data: r
                        };
                    }),
                    ...(controllers || []).map((ctrl, idx) => {
                        const id = makeId("controller", parentId, idx, ctrl.path);

                        const { nodes, edges } = addRecursedLevel(ctrl.children, id);
                        restChildrenNodes.push(...nodes);
                        restChildrenEdges.push(...edges);

                        return {
                            id,
                            label: ctrl.name + (ctrl.metadata?.pluginName ? `\n[${ctrl.metadata.pluginName}]` : ''),
                            ...calculateNodeBounds(ctrl),
                            type: "controller",
                            style: getNodeStyle(id),
                            data: ctrl
                        };
                    })
                ].map(n => {
                    return {
                        style: {},
                        ...n,
                        draggable: false
                    };
                });

                let lastMiddlewareId = "";
                // Create middleware edges
                middleware?.forEach((mw, idx) => {
                    const id = makeId("middleware", parentId, idx, mw.name);

                    let sourceId = idx === 0 ?
                        parentId ? parentId : "entrypoint-http"
                        : makeId("middleware", parentId, idx - 1, middleware[idx - 1].name);

                    elkEdges.push({
                        id,
                        sources: [sourceId],
                        targets: [id],
                        type: "straight",
                        style: {
                            ...getEdgeStyle(mw),
                            backgroundColor: 'blue'
                        }
                    });
                    lastMiddlewareId = id;
                });

                routers?.forEach((r, idx) => {
                    const id = makeId("router", parentId, idx, r.path);
                    elkEdges.push({
                        id,
                        sources: [lastMiddlewareId || parentId],
                        targets: [id],
                        style: {
                            ...getEdgeStyle(r),
                            backgroundColor: 'blue'
                        }
                    });
                });
                controllers?.forEach((ctrl, idx) => {
                    const id = makeId("controller", parentId, idx, ctrl.path);
                    console.log({ id, lastMiddlewareId });
                    elkEdges.push({
                        id,
                        sources: [lastMiddlewareId || parentId],
                        targets: [id],
                        style: {
                            ...getEdgeStyle(ctrl),
                            backgroundColor: 'blue'
                        }
                    });
                });

                const nodes = elkNodes.concat(restChildrenNodes);
                const edges = elkEdges.concat(restChildrenEdges);

                return { nodes, edges };
            }

            const { nodes: elkNodes, edges: elkEdges } = addRecursedLevel(registryData);
            elkNodes.push({
                id: "entrypoint-http", width: 64, height: 64, type: "entrypoint"
            });

            const nodeNodeGap = '20';
            const nodeEdgeGap = '20';
            const graph = {
                id: 'root',
                layoutOptions: {
                    'elk.algorithm': 'layered',
                    'elk.direction': 'DOWN',
                    'elk.spacing.nodeNode': nodeNodeGap,
                    'elk.layered.spacing.nodeNodeBetweenLayers': nodeNodeGap,
                    'elk.spacing.edgeNode': nodeEdgeGap,
                    'elk.layered.spacing.edgeEdgeBetweenLayers': nodeEdgeGap,
                    'elk.layered.spacing.edgeNodeBetweenLayers': nodeEdgeGap,
                    'elk.layered.wrapping.additionalEdgeSpacing': nodeEdgeGap,
                    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
                },
                children: elkNodes,
                edges: elkEdges
            };

            const layoutedGraph = await elk.layout(graph);

            const flowNodes = [];

            const processLayoutedNode = (node, parentId = undefined) => {
                if (node.id === 'root') {
                    node.children?.forEach(c => processLayoutedNode(c));
                    return;
                }

                const style = NODE_STYLES[node.type] || {};
                const customStyle = node.style || {};
                const isGroup = node.children && node.children.length > 0;

                flowNodes.push({
                    id: node.id,
                    position: { x: node.x, y: node.y },
                    data: node,
                    style: {
                        ...style,
                        ...customStyle,
                        width: node.width,
                        height: node.height,
                        zIndex: isGroup ? -1 : 1
                    },
                    type: node.type,
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
                type: e.type || 'smoothstep',
                animated: true,
                style: { stroke: '#475569', strokeWidth: 2 },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                },
            }));

            setNodes(flowNodes);
            setEdges(flowEdges);

            setLoading(false);
        };

        buildGraph();
    }, []);

    if (loading) return React.createElement('div', { style: { color: '#fff', padding: '20px' } }, 'Laying out graph...');

    return React.createElement('div', {
        style: isFullscreen ? {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 9999,
            backgroundColor: '#1e293b' // Match theme
        } : {
            width: '100%',
            height: '600px', // Ensure explicit height if container doesn't provide it, though normally #cy does.
            position: 'relative'
        }
    },
        React.createElement(ReactFlow, {
            nodes,
            edges,
            onNodesChange,
            onEdgesChange,
            nodeTypes, // Register custom types
            fitView: true,
            minZoom: 0.1,
            onMove: (_, viewport) => setZoom(viewport.zoom),
            onInit: (instance) => setZoom(instance.getZoom())
        },
            React.createElement(Background, { color: '#334155', gap: 16 }),
            React.createElement(Controls),
            React.createElement('div', {
                style: {
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    zIndex: 5,
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center'
                }
            },
                React.createElement('div', {
                    style: {
                        background: 'rgba(30, 41, 59, 0.8)',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        border: '1px solid #475569'
                    }
                }, `${Math.round(zoom * 100)}%`),
                React.createElement('button', {
                    onClick: () => setIsFullscreen(!isFullscreen),
                    style: {
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        transition: 'background 0.2s'
                    }
                }, isFullscreen ? "Exit Fullscreen" : "Fullscreen")
            )
        )
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

