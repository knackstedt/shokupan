// Registry Data
// const registryData = <% ~JSON.stringify(it.registry) %>;
const rootPath = "<%~ it.rootPath %>";
const linkPattern = "<%~ it.linkPattern %>";

const headers = getRequestHeaders ? getRequestHeaders() : {};
const basePath = window.location.pathname.endsWith('/') ? '' : window.location.pathname;
const url = basePath + (basePath.endsWith('/') ? 'registry' : '/registry');

function renderRegistry(node, container) {
    if (!node) {
        container.innerHTML = '<div style="color: var(--text-secondary)">No registry data available</div>';
        return;
    }

    const wrapper = document.createElement('div');

    // Helper to clean paths
    const cleanPath = (p) => {
        if (!p) return '';
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

            return `<a href="${link}" target="_blank" style="text-decoration: none; color: inherit;"><span class="tree-meta" style="cursor: pointer; text-decoration: underline;">${relative}:${line}</span></a>${displayNameStr} ${builtin} ${pluginName}`;
        }
        return '';
    };

    // 1. Flatten all items
    const allItems = [];
    if (node.middleware) node.middleware.forEach(i => allItems.push({ ...i, kind: 'middleware' }));
    if (node.routes) node.routes.forEach(i => allItems.push({ ...i, kind: 'route' }));
    if (node.routers) node.routers.forEach(i => allItems.push({ ...i, kind: 'router' }));
    if (node.controllers) node.controllers.forEach(i => allItems.push({ ...i, kind: 'controller' }));

    // 2. Sort by Order
    const kindPriority = { 'middleware': 0, 'router': 1, 'controller': 2, 'route': 3 };
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

    // Helper for Tooltips
    function getTooltipHtml(id) {
        // Return default 0 metrics if not found, rather than empty string, so tooltip always appears if intended
        const m = (metrics.nodeMetrics && metrics.nodeMetrics[id]) ? metrics.nodeMetrics[id] : { requests: 0, failures: 0 };
        const totalReqs = metrics.totalRequests || 1; // avoid div/0
        const percent = ((m.requests / totalReqs) * 100).toFixed(1);
        const failRate = m.requests > 0 ? ((m.failures / m.requests) * 100).toFixed(1) : '0.0';

        return `
            <div class="tooltip-text">
                <div style="font-weight:bold; margin-bottom:4px; border-bottom:1px solid var(--text-secondary); padding-bottom:2px;">Metrics</div>
                <div style="display:flex; justify-content:space-between;"><span>Requests:</span> <span style="font-family:monospace">${m.requests}</span></div>
                <div style="display:flex; justify-content:space-between;"><span>Traffic:</span> <span style="font-family:monospace">${percent}%</span></div>
                <div style="display:flex; justify-content:space-between;"><span>Failures:</span> <span style="font-family:monospace; color:${m.failures > 0 ? '#ef4444' : 'inherit'}">${m.failures} (${failRate}%)</span></div>
            </div>
        `;
    }

    function renderPath(path) {
        const parts = path.split('/').slice(1);

        let out = '';
        parts.forEach((part, index) => {
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
            header.innerHTML = `
                <span class="badge badge-ROUTER">ROUTER</span>
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
    });
    container.appendChild(wrapper);
}

const registryContainer = document.getElementById('registry-tree');

fetch(url, { headers })
    .then(res => res.json())
    .then(({ registry }) => {
        renderRegistry(window.registryData = registry, registryContainer);
    });