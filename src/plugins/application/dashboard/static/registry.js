
window.renderRegistry = function renderRegistry(node, container) {
    const config = window.SHOKUPAN_CONFIG || {};
    const rootPath = config.rootPath || "";
    const linkPattern = config.linkPattern || "vscode://file/{{absolute}}:{{line}}";

    if (!node) {
        container.innerHTML = '<div style="color: var(--text-secondary)">No registry data available</div>';
        return;
    }

    // 0. Pre-process paths for shortening
    // Collect all paths
    const allFilePaths = new Set();
    const collectPaths = (n) => {
        if (!n) return;
        if (n.metadata && n.metadata.file) allFilePaths.add(n.metadata.file);
        if (n.middleware) n.middleware.forEach(collectPaths);
        if (n.routers) n.routers.forEach(collectPaths);
        if (n.controllers) n.controllers.forEach(collectPaths);
        if (n.routes) n.routes.forEach(collectPaths);
        if (n.events) n.events.forEach(collectPaths);
        if (n.children) collectPaths(n.children); // recursive for routers
    };
    collectPaths(node);

    // Compute Shortest Unique Paths
    const shortPathMap = {};
    const pathsByFilename = {};

    allFilePaths.forEach(p => {
        const parts = p.split('/');
        const filename = parts.pop();
        if (!pathsByFilename[filename]) pathsByFilename[filename] = [];
        pathsByFilename[filename].push({ full: p, parts: parts });
    });

    Object.keys(pathsByFilename).forEach(filename => {
        const group = pathsByFilename[filename];
        if (group.length === 1) {
            shortPathMap[group[0].full] = filename;
        } else {
            // Collision handling
            group.forEach(item => {
                let suffix = filename;
                let depth = 0;
                // Add parent dirs until unique within this group
                // Note: This is a simple approach. Strictly we need to check uniqueness against ALL other paths in group.
                while (true) {
                    if (depth >= item.parts.length) break; // Should not happen if they are different files

                    // Check if current suffix is unique in group
                    const conflicts = group.filter(g => {
                        if (g.full === item.full) return false;
                        // Construct suffix for g with same depth
                        const gParts = g.full.split('/');
                        const gSuffix = gParts.slice(gParts.length - 1 - depth).join('/');
                        return gSuffix === suffix;
                    });

                    if (conflicts.length === 0) break;

                    // prepend parent
                    const parent = item.parts[item.parts.length - 1 - depth];
                    suffix = parent + '/' + suffix;
                    depth++;
                }
                shortPathMap[item.full] = suffix;
            });
        }
    });

    const wrapper = document.createElement('div');

    // Helper to clean paths
    const cleanPath = (p) => {
        if (!p) return '';
        if (shortPathMap[p]) return shortPathMap[p];
        if (p.startsWith(rootPath)) return p.slice(rootPath.length + 1);
        return p;
    };

    // Helper to create file link
    const createFileMeta = (metadata, defaultName) => {
        if (metadata && metadata.file) {
            const relative = cleanPath(metadata.file);
            const absolute = metadata.file;
            const line = metadata.line;

            // Generate Link
            let link = linkPattern
                .replace('{{absolute}}', absolute)
                .replace('{{relative}}', relative)
                .replace('{{line}}', line);

            const name = metadata.name || defaultName;

            // Label Filtering
            const blocklist = ['wrappedHandler', 'anonymous', 'finalHandler', 'routeHandler'];
            let displayNameStr = '';
            if (name && !blocklist.includes(name)) {
                displayNameStr = ` <span style="color: #94a3b8; font-size: 0.8em;">(${name})</span>`;
            }

            const builtin = metadata.isBuiltin ? `<span class="badge" style="background: #059669; margin-left:10px;">BUILTIN</span>` : '';
            const pluginName = metadata.pluginName ? `<span style="color: #6ee7b7; margin-left: 5px;">[${metadata.pluginName}]</span>` : '';

            // Use relative (short) path for display
            return `<a href="${link}" style="text-decoration: none; color: inherit;">
                <span class="tree-meta" style="cursor: pointer; text-decoration: underline;">
                ${relative}:${line}</span>
                </a>
                ${!metadata.pluginName ? displayNameStr : ''} ${builtin} ${pluginName}
            `;
        }
        return '';
    };

    // 1. Flatten all items
    const allItems = [];
    if (node.middleware) node.middleware.forEach(i => allItems.push({ ...i, kind: 'middleware' }));
    if (node.routes) node.routes.forEach(i => allItems.push({ ...i, kind: 'route' }));
    if (node.routers) node.routers.forEach(i => allItems.push({ ...i, kind: 'router' }));
    if (node.controllers) node.controllers.forEach(i => allItems.push({ ...i, kind: 'controller' }));
    if (node.events) node.events.forEach(i => allItems.push({ ...i, kind: 'event' }));

    // 2. Sort by Order
    const kindPriority = { 'middleware': 0, 'router': 1, 'controller': 2, 'route': 3, 'event': 4 };
    allItems.sort((a, b) => {
        const pA = kindPriority[a.kind] !== undefined ? kindPriority[a.kind] : 99;
        const pB = kindPriority[b.kind] !== undefined ? kindPriority[b.kind] : 99;
        if (pA !== pB) return pA - pB;
        return (a.order || 0) - (b.order || 0);
    });

    // Deduplication (by ID if available, or path+method)
    const uniqueItems = [];
    const seenIds = new Set();
    allItems.forEach(item => {
        const uniqueKey = item.id || (item.kind + ':' + (item.path || item.name));
        if (!seenIds.has(uniqueKey)) {
            seenIds.add(uniqueKey);
            uniqueItems.push(item);
        }
    });
    // Replace allItems with deduplicated list
    allItems.length = 0;
    allItems.push(...uniqueItems);

    // 3. Render
    const renderedRoutes = new Set(); // Track rendered routes to avoid duplication when grouping

    // Let's rebuild the controller groups map using the flattened objects
    const controllerGroups = new Map();
    allItems.forEach(item => {
        if (item.kind === 'route' && item.tags && item.tags.length > 0) {
            const tag = item.tags[0];
            if (!controllerGroups.has(tag)) controllerGroups.set(tag, []);
            controllerGroups.get(tag).push(item);
        }
    });

    function getTooltipHtml(id) {
        // Return default 0 metrics if not found, rather than empty string, so tooltip always appears if intended
        const metrics = window.metrics || {};
        const m = (metrics.nodeMetrics && metrics.nodeMetrics[id]) ? metrics.nodeMetrics[id] : { requests: 0, failures: 0 };
        const totalReqs = metrics.totalRequests || 1; // avoid div/0
        const percent = ((m.requests / totalReqs) * 100).toFixed(1);
        const failRate = m.requests > 0 ? ((m.failures / m.requests) * 100).toFixed(1) : '0.0';

        return `
            <div class="tooltip-text">
                <div style="font-weight:bold; margin-bottom:4px; border-bottom:1px solid var(--text-secondary); padding-bottom:2px;">Metrics</div>
                <div style="display:flex; justify-content:space-between;"><span>Requests:</span> <span style="font: var(--shokupan-font-mono)">${m.requests}</span></div>
                <div style="display:flex; justify-content:space-between;"><span>Traffic:</span> <span style="font: var(--shokupan-font-mono)">${percent}%</span></div>
                <div style="display:flex; justify-content:space-between;"><span>Failures:</span> <span style="font: var(--shokupan-font-mono); color:${m.failures > 0 ? '#ef4444' : 'inherit'}">${m.failures} (${failRate}%)</span></div>
            </div>
        `;
    }

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

    allItems.forEach(item => {
        // Middleware
        if (item.kind === 'middleware') {
            const div = document.createElement('div');
            const mwContainer = document.createElement('div');
            mwContainer.className = 'tree-node';

            const mwDiv = document.createElement('div');
            mwDiv.className = 'tree-item tooltip'; // Add tooltip class
            const meta = createFileMeta(item.metadata, item.name);
            const tooltipHtml = getTooltipHtml(item.id);
            mwDiv.innerHTML = `<span class="badge" style="background: #9333ea; color: white;">MIDDLEWARE</span> <span class="tree-label">${item.name}</span>${meta}${tooltipHtml}`;

            mwContainer.appendChild(mwDiv);
            div.appendChild(mwDiv);
            wrapper.appendChild(div);
        }

        // Router
        else if (item.kind === 'router') {
            const div = document.createElement('div');
            const header = document.createElement('div');
            header.className = 'tree-item tooltip'; // Add tooltip class
            const meta = createFileMeta(item.metadata, 'Router');
            const tooltipHtml = getTooltipHtml(item.id);
            const isPlugin = item.metadata && item.metadata.pluginName;
            const badgeLabel = isPlugin ? 'PLUGIN' : 'ROUTER';
            const badgeClass = isPlugin ? 'badge-PLUGIN' : 'badge-ROUTER';

            // Add custom style for PLUGIN badge if needed, or rely on generic badge class + modifier
            // For now, let's inject a style for badge-PLUGIN if it doesn't exist, or just inline it.
            // Actually, let's just use inline style for the distinctive color if it's a plugin 
            // to ensure it stands out without editing CSS file.
            const badgeStyle = isPlugin ? 'background: #f59e0b; color: #000;' : '';

            header.innerHTML = `
                <span class="badge ${badgeClass}" style="${badgeStyle}">${badgeLabel}</span>
                <span class="tree-label">${renderPath(item.path)}</span>
                ${meta}
                ${tooltipHtml}
            `;
            div.appendChild(header);

            if (item.children) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'tree-node';
                renderRegistry(item.children, childrenContainer);
                div.appendChild(childrenContainer);
            }
            wrapper.appendChild(div);
        }

        // Controller
        else if (item.kind === 'controller') {
            // Render Controller Group
            const name = item.name;
            const cPath = item.path || '';

            // Render Header
            const div = document.createElement('div');
            const header = document.createElement('div');
            header.className = 'tree-item tooltip'; // Add tooltip class
            const meta = createFileMeta(item.metadata, name);
            const tooltipHtml = getTooltipHtml(item.id);
            header.innerHTML = `
                <span class="badge badge-CONTROLLER">CTRL</span>
                <span class="tree-label" style="font-weight: bold;">${name} <span style="color:var(--text-secondary); font-weight:normal;">(${renderPath(cPath)})</span></span>
                ${meta}
                ${tooltipHtml}
            `;
            div.appendChild(header);

            // Render Routes belonging to this controller
            const routes = item.children.routes || [];
            if (routes.length > 0) {
                const routesContainer = document.createElement('div');
                routesContainer.className = 'tree-node';

                routes.forEach(r => {
                    renderedRoutes.add(r); // Mark as rendered

                    const rDiv = document.createElement('div');
                    rDiv.className = 'tree-item tooltip'; // Add tooltip class
                    const method = r.method.toUpperCase();
                    const badgeClass = `badge-${method}`;
                    const rMeta = createFileMeta(r.metadata, r.handlerName);
                    const tHtml = getTooltipHtml(r.id);
                    rDiv.innerHTML = `
                        <span class="badge ${badgeClass}" style="width: 50px; text-align: center; display: inline-block;">${method}</span>
                        <span class="tree-label">${renderPath(r.path)}</span>
                        ${rMeta}
                        ${tHtml}
                    `;
                    routesContainer.appendChild(rDiv);
                });
                div.appendChild(routesContainer);
            } else {
                // Empty controller or no tagged routes found
                // It's still valid to show it
                const note = document.createElement('div');
                note.className = 'tree-node';
                note.innerHTML = '<span style="color: #64748b; font-style: italic;">(No routes detected)</span>';
                div.appendChild(note);
            }
            wrapper.appendChild(div);
        }

        // Route (Loose)
        else if (item.kind === 'route') {
            if (renderedRoutes.has(item)) return; // Skip if already rendered in controller

            const div = document.createElement('div');
            div.className = 'tree-item tooltip'; // Add tooltip class
            const method = item.method.toUpperCase();
            const badgeClass = `badge-${method}`;
            const meta = createFileMeta(item.metadata, item.handlerName);
            const tHtml = getTooltipHtml(item.id);

            div.innerHTML = `
                <span class="badge ${badgeClass}" style="width: 50px; text-align: center; display: inline-block;">${method}</span>
                <span class="tree-label">${renderPath(item.path)}</span>
                ${meta}
                ${tHtml}
            `;
            wrapper.appendChild(div);
        }

        // Event
        else if (item.kind === 'event') {
            const div = document.createElement('div');
            div.className = 'tree-item tooltip'; // Add tooltip class

            // Event Badge style
            const badgeStyle = "width: 50px; text-align: center; display: inline-block;";

            const meta = createFileMeta(item.metadata, item.handlerName);
            const tHtml = getTooltipHtml(item.id);

            div.innerHTML = `
                <span class="badge badge-SEND" style="${badgeStyle}">WS</span>
                <span class="tree-label">${item.name}</span>
                ${meta}
                ${tHtml}
            `;
            wrapper.appendChild(div);
        }
    });
    container.innerHTML = '';
    container.appendChild(wrapper);
};

window.fetchRegistry = async function fetchRegistry() {
    const registryContainer = document.getElementById('registry-tree');
    if (!registryContainer) return;

    const headers = typeof getRequestHeaders !== 'undefined' ? getRequestHeaders() : {};
    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname.slice(0, -1) : window.location.pathname;
    const url = basePath + '/registry';

    try {
        const res = await fetch(url, { headers });
        const { registry } = await res.json();
        renderRegistry(window.registryData = registry, registryContainer);
    } catch (e) {
        console.error("Failed to fetch registry", e);
    }
};

document.addEventListener('DOMContentLoaded', fetchRegistry);

