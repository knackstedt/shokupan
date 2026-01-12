// Client-side JavaScript for API Explorer

// Global State
let explorerData = { routes: [], config: {}, info: {} };
let virtualScroller = null;

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderInfoSection();
    setupSidebar();

    // Initialize Virtual Scroller
    virtualScroller = new VirtualScroller(
        document.querySelector('.content'),
        document.getElementById('virtual-scroller-container'),
        explorerData.routes,
        renderOperationCard,
        150 // estimated item height (smaller average)
    );

    // Handle hash navigation manually since elements might not exist yet
    handleHashNavigation();
});

function loadData() {
    const script = document.getElementById('explorer-data');
    if (script) {
        try {
            explorerData = JSON.parse(script.textContent);
        } catch (e) {
            console.error('Failed to parse explorer data', e);
        }
    }
}

function renderInfoSection() {
    // Render the initial info section if it exists
    const container = document.querySelector('.info-section-placeholder');
    if (!container || !explorerData.info) return;

    const { title, description } = explorerData.info;
    const html = `
        <div class="info-section">
            <h1>${title || 'API Explorer'}</h1>
            ${description ? `<div class="markdown-content" data-markdown="true">${parseMarkdown(description)}</div>` : ''}
        </div>
    `;
    container.innerHTML = html;
}

// --- Virtual Scroller Implementation ---

class VirtualScroller {
    constructor(scrollContainer, contentContainer, items, renderItemFn, estimatedHeight = 150) {
        this.scrollContainer = scrollContainer;
        this.contentContainer = contentContainer;
        this.items = items;
        this.renderItemFn = renderItemFn;
        this.estimatedHeight = estimatedHeight;

        // State for variable height
        this.itemSizes = new Map(); // index -> height
        this.itemOffsets = new Map(); // index -> absolute top
        this.totalInternalHeight = 0;

        this.visibleItems = new Map(); // index -> { element, resizeObserver }
        this.buffer = 5; // Number of items above/below to render
        this.ticking = false;
        this.isRecalculating = false;

        this.init();
    }

    init() {
        this.recalculateOffsets();

        this.scrollContainer.addEventListener('scroll', () => this.onScroll());
        window.addEventListener('resize', () => {
            this.recalculateOffsets();
            this.onScroll();
        });

        // Initial render
        this.updateVisibleItems();
    }

    // Iterate through all items to calculate their cumulative offsets based on known sizes
    recalculateOffsets() {
        let offset = 0;
        this.itemOffsets.clear();

        for (let i = 0; i < this.items.length; i++) {
            this.itemOffsets.set(i, offset);
            const height = this.itemSizes.get(i) || this.estimatedHeight;
            offset += height;
        }

        this.totalInternalHeight = offset;
        this.contentContainer.style.height = `${this.totalInternalHeight}px`;
    }

    onScroll() {
        if (!this.ticking) {
            window.requestAnimationFrame(() => {
                this.updateVisibleItems();
                this.ticking = false;
            });
            this.ticking = true;
        }
    }

    // Binary search to find the item index at a given scroll offset
    findStartIndex(scrollTop) {
        let low = 0;
        let high = this.items.length - 1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const offset = this.itemOffsets.get(mid);
            const height = this.itemSizes.get(mid) || this.estimatedHeight;

            if (offset <= scrollTop && offset + height > scrollTop) {
                return mid;
            } else if (offset < scrollTop) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return Math.max(0, low - 1);
    }

    updateVisibleItems() {
        const scrollTop = this.scrollContainer.scrollTop;
        const viewportHeight = this.scrollContainer.clientHeight;

        const startIndex = Math.max(0, this.findStartIndex(scrollTop) - this.buffer);
        // We find the end index by looking for the item at (scrollTop + viewportHeight)
        const endIndex = Math.min(
            this.items.length - 1,
            this.findStartIndex(scrollTop + viewportHeight) + this.buffer
        );

        // Remove items no longer in range
        for (const [index, data] of this.visibleItems) {
            if (index < startIndex || index > endIndex) {
                if (data.resizeObserver) data.resizeObserver.disconnect();
                data.element.remove();
                this.visibleItems.delete(index);
            }
        }

        // Add new items
        let needsRecalc = false;
        for (let i = startIndex; i <= endIndex; i++) {
            if (!this.visibleItems.has(i)) {
                this.renderItem(i);
                // If we rendered a new item and we don't know its size yet, we might need a recalc cycle shortly
                // but ResizeObserver will trigger that.
            } else {
                // Update position if it shifted (e.g. dynamic updates above)
                const el = this.visibleItems.get(i).element;
                const expectedTop = this.itemOffsets.get(i);
                // Optimization: direct style access is fast enough, but avoid layout thrashing
                if (parseInt(el.style.top) !== expectedTop) {
                    el.style.top = `${expectedTop}px`;
                }
            }
        }

        // Initialize components (Monaco, etc.) - handled internally by renderItem/observers 
        // passing container to setupMonaco for lazy loading logic inside setupMonaco? 
        // Actually, we should call setupMonaco for the newly added items.
        // We can pass the specific elements to setupMonaco.

        const newElements = [];
        for (let i = startIndex; i <= endIndex; i++) {
            // We can just grab from map
            newElements.push(this.visibleItems.get(i).element);
        }
        setupMonacoForElements(newElements);
        setupTesterForElements(newElements);
    }

    renderItem(index) {
        const item = this.items[index];
        const html = this.renderItemFn(item, index);

        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        const element = wrapper.firstElementChild;

        // Position absolutely
        const top = this.itemOffsets.get(index);
        element.style.position = 'absolute';
        element.style.top = `${top}px`;
        element.style.left = '0';
        element.style.right = '0';
        // element.style.height = 'auto'; // Default

        this.contentContainer.appendChild(element);

        // Observe resize
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                this.onItemResize(index, entry.borderBoxSize[0].blockSize);
            }
        });
        ro.observe(element);

        this.visibleItems.set(index, { element, resizeObserver: ro });
    }

    onItemResize(index, newHeight) {
        const oldHeight = this.itemSizes.get(index) || this.estimatedHeight;
        if (Math.abs(newHeight - oldHeight) > 1) { // Tolerance of 1px
            this.itemSizes.set(index, newHeight);

            // If this item is resizing, we need to shift everyone below it.
            // Full recalculate specific to this change is cleaner for correctness:
            this.recalculateOffsets();

            // Adjust current render positions immediately to prevent visual overlap
            this.updateVisiblePositions();
        }
    }

    updateVisiblePositions() {
        for (const [index, data] of this.visibleItems) {
            const top = this.itemOffsets.get(index);
            data.element.style.top = `${top}px`;
        }
    }

    scrollToItem(id) {
        const index = this.items.findIndex(item => item.op.operationId === id);
        if (index !== -1) {
            // Ensure offsets are fresh
            this.recalculateOffsets();
            const top = this.itemOffsets.get(index);
            this.scrollContainer.scrollTop = top;
        }
    }
}


function parseMarkdown(text) {
    if (!text) return '';
    if (typeof marked === 'undefined') return text;

    const renderer = new marked.Renderer();
    const originalBlockquote = renderer.blockquote.bind(renderer);

    renderer.blockquote = (quote) => {
        const match = quote.match(/^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/);
        if (match) {
            const type = match[1];
            const content = quote.replace(/^<p>\[!.*?\]\s*/, '');
            return `<div class="markdown-alert ${type.toLowerCase()}">
                        <div class="markdown-alert-title">${type}</div>
                        ${content}
                    </div>`;
        }
        return originalBlockquote(quote);
    };

    return marked.parse(text, { renderer });
}


function renderOperationCard(route, index) {
    const { method, path, op } = route;
    const shokupanSource = op['x-shokupan-source'];
    const sourceInfo = op['x-source-info'];
    const middleware = op['x-shokupan-middleware'] || [];

    const uniqueParams = [];
    const seen = new Set();
    (op.parameters || []).forEach((p) => {
        const key = `${p.name}-${p.in}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueParams.push(p);
        }
    });

    // Extract code
    let sourceCode = sourceInfo?.snippet || shokupanSource?.code || null;
    let cleanDescription = op.description || '';
    let startLine = 1;

    // Check if we have line info
    if (shokupanSource?.line) {
        startLine = shokupanSource.line;
    }

    // Handle embedded code blocks in description
    if (cleanDescription) {
        const codeBlockMatch = cleanDescription.match(/```(?:typescript|javascript)\n([\s\S]*?)\n```/);
        if (codeBlockMatch) {
            sourceCode = codeBlockMatch[1];
            cleanDescription = cleanDescription.replace(/```(?:typescript|javascript)\n[\s\S]*?\n```/, '').trim();
        }
    }

    let viewInEditorLink = '';
    if (shokupanSource?.file) {
        const file = shokupanSource.file;
        const line = shokupanSource.line || 1;
        viewInEditorLink = `<div style="margin-top: 0.5rem">
            <a href="vscode://file/${file}:${line}" style="color: var(--color-accent); font-size: 0.9rem; text-decoration: none">
                📝 View in Editor
            </a>
        </div>`;
    }

    const warningIcon = sourceInfo?.isRuntime ? `
        <span class="warning-icon" title="Static Analysis Failed: Runtime Fallback used. Source may be inaccurate." style="margin-left: 10px; display: inline-flex; align-items: center; cursor: help;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="orange" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
        </span>
    ` : '';

    const paramsHtml = uniqueParams.map(p => `
        <div class="param-row">
            <label>
                <span class="param-name">${escapeHtml(p.name)}</span>
                <span class="param-in">(${p.in})</span>
                ${p.required ? '<span class="required">*</span>' : ''}
            </label>
            <input type="text" name="${p.name}" data-in="${p.in}" placeholder="${escapeHtml(p.description || '')}" />
        </div>
    `).join('');

    const descriptionHtml = cleanDescription ? `<div class="op-description markdown-content">${parseMarkdown(cleanDescription)}</div>` : '';

    const sourceHtml = sourceCode ? `
        <div class="code-section">
            <div class="source-header">
                <h4>Source Code</h4>
            </div>
            <div class="monaco-editor read-only" 
                 data-code="${btoa(unescape(encodeURIComponent(sourceCode)))}" 
                 data-language="typescript"
                 data-start-line="${startLine}"
                 ></div>
        </div>
    ` : '';

    const middlewareHtml = middleware.length > 0 ? `
        <div class="middleware-section">
            <span class="middleware-label">Middleware:</span>
            <div class="middleware-list">
                ${middleware.map(mw => {
        const tooltip = mw.metadata ? `File: ${mw.metadata.file}:${mw.metadata.line}` : '';
        return `<span class="middleware-badge" title="${tooltip}">${escapeHtml(mw.name)}</span>`;
    }).join('')}
            </div>
        </div>
    ` : '';

    return `
        <section id="${op.operationId}" class="operation-card" data-index="${index}">
            <header class="op-header">
                <div class="op-title">
                    <span class="method-badge large ${method}">${method.toUpperCase()}</span>
                    <h2 class="path">${escapeHtml(path)}</h2>
                    ${warningIcon}
                </div>
                <div class="op-summary">${escapeHtml(op.summary || '')}</div>
                ${middlewareHtml}
                ${viewInEditorLink}
            </header>
            ${descriptionHtml}
            ${sourceHtml}
            
            <div class="tester-section">
                <h3>Try It Out</h3>
                <form class="tester-form" data-method="${method}" data-path="${path}">
                    ${uniqueParams.length > 0 ? `<div class="params-table"><h4>Parameters</h4>${paramsHtml}</div>` : ''}
                    <div class="actions">
                        <button type="submit" class="btn primary">Send Request</button>
                        <div class="copy-actions">
                             <button type="button" class="btn secondary copy-curl">Copy cURL</button>
                             <button type="button" class="btn secondary copy-fetch">Copy Fetch</button>
                        </div>
                    </div>
                </form>
                <div class="response-viewer" style="display: none">
                    <h4>Response</h4>
                    <div class="status-bar">
                        <span class="status-code"></span>
                        <span class="duration"></span>
                    </div>
                    <div class="monaco-response" data-response="true"></div>
                </div>
            </div>
        </section>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function handleHashNavigation() {
    const hash = window.location.hash.slice(1);
    // Wait a brief moment for layout
    setTimeout(() => {
        if (hash && virtualScroller) {
            virtualScroller.scrollToItem(hash);
        }
    }, 100);

    // Intercept clicks on nav items
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a[href^="#"]');
        if (link) {
            e.preventDefault();
            const id = link.getAttribute('href').slice(1);
            if (virtualScroller) {
                virtualScroller.scrollToItem(id);
                history.pushState(null, null, `#${id}`);
            }
        }
    });
}

function setupSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const resizeHandle = document.querySelector('.resize-handle');
    const toggleBtn = document.querySelector('.toggle-sidebar');
    const collapseTrigger = document.querySelector('.sidebar-collapse-trigger');

    if (!sidebar) return;

    function toggleSidebar() {
        sidebar.classList.toggle('collapsed');
    }

    if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);
    if (collapseTrigger) collapseTrigger.addEventListener('click', toggleSidebar);

    // Collapsible Groups
    document.querySelectorAll('.nav-group-title').forEach(title => {
        title.addEventListener('click', (e) => {
            const group = e.currentTarget.parentElement;
            group.classList.toggle('collapsed');
        });
    });

    if (resizeHandle) {
        let isResizing = false;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newWidth = Math.max(150, Math.min(600, e.clientX));
            document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
        });
    }
}

// Lazy load Monaco instances using IntersectionObserver
function setupMonacoForElements(elements) {
    if (typeof require === 'undefined') return;

    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                if (!el.dataset.monacoLoading && !el.dataset.initialized) {
                    el.dataset.monacoLoading = "true";
                    initMonacoEditor(el);
                    obs.unobserve(el);
                }
            }
        });
    }, { rootMargin: "200px 0px" }); // Preload a bit before valid

    elements.forEach(container => {
        container.querySelectorAll('.monaco-editor').forEach(el => {
            if (el.dataset.initialized || el.dataset.monacoLoading) return;

            // Initial height setup so the scrollbar doesn't jump too wildly before loading
            const code = el.dataset.code ? decodeURIComponent(escape(atob(el.dataset.code))) : '';
            const lineHeight = 18;
            const lines = code.split('\n').length;
            el.style.height = ((lines + 1) * lineHeight + 12) + 'px';

            observer.observe(el);
        });
    });
}

function initMonacoEditor(el) {
    require(['vs/editor/editor.main'], function () {
        if (el.dataset.initialized) return;
        el.dataset.initialized = 'true';

        const code = el.dataset.code ? decodeURIComponent(escape(atob(el.dataset.code))) : '';
        const lang = el.dataset.language || 'typescript';
        const startLine = parseInt(el.dataset.startLine || '1');
        const isResponse = el.dataset.response === 'true';

        const lineHeight = 18;
        // const lines = code.split('\n').length;
        // el.style.height = ((lines + 1) * lineHeight + 12) + 'px';

        const editor = monaco.editor.create(el, {
            value: code,
            language: lang,
            theme: 'vs-dark',
            readOnly: true,
            minimap: { enabled: false },
            lineNumbers: (num) => (startLine + num - 1).toString(),
            lineHeight: lineHeight,
            fontSize: 13,
            scrollBeyondLastLine: false,
            scrollbar: { alwaysConsumeMouseWheel: false },
            automaticLayout: true,
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            overviewRulerLanes: 0
        });

        // Add ResizeObserver to update height based on content if needed
        // For read-only views, getContentHeight is useful
        const updateHeight = () => {
            const contentHeight = editor.getContentHeight();
            if (contentHeight > 0) {
                el.style.height = `${contentHeight}px`;
                editor.layout();
            }
        };

        // Initial sizing
        updateHeight();

        // If content changes (for response viewers) or on load
        editor.onDidChangeModelContent(updateHeight);

        // Trigger a check shortly after creation just in case
        setTimeout(updateHeight, 50);
    });
}


function setupTesterForElements(elements) {
    elements.forEach(container => {
        container.querySelectorAll('.tester-form').forEach(form => {
            if (form.dataset.initialized) return;
            form.dataset.initialized = 'true';

            const method = form.dataset.method;
            const path = form.dataset.path;

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await sendRequest(form, method, path);
            });

            // Helpers
            const section = form.closest('.tester-section');
            section.querySelector('.copy-curl').addEventListener('click', () => {
                copyToClipboard(buildCurl(form, method, path));
            });
            section.querySelector('.copy-fetch').addEventListener('click', () => {
                copyToClipboard(buildFetch(form, method, path));
            });
        });
    });
}

// ... sendRequest, buildRequestFromForm ...

async function sendRequest(form, method, path) {
    const request = buildRequestFromForm(form, method, path);
    const responseViewer = form.closest('.tester-section').querySelector('.response-viewer');
    responseViewer.style.display = 'block';

    const startTime = Date.now();
    try {
        const res = await fetch(request.url, request.options);
        const duration = Date.now() - startTime;
        const bodyText = await res.text();

        const statusCode = responseViewer.querySelector('.status-code');
        const durationEl = responseViewer.querySelector('.duration');
        const responseContainer = responseViewer.querySelector('.monaco-response');

        statusCode.textContent = `Status: ${res.status}`;
        statusCode.className = `status-code ${res.status >= 200 && res.status < 300 ? 'success' : 'error'}`;
        durationEl.textContent = `${duration}ms`;

        let displayText = bodyText;
        let language = 'text';
        try {
            const json = JSON.parse(bodyText);
            displayText = JSON.stringify(json, null, 2);
            language = 'json';
        } catch { }

        // Render response Monaco
        responseContainer.innerHTML = '';
        responseContainer.removeAttribute('data-initialized');
        responseContainer.removeAttribute('data-monaco-loading');

        // We can reuse the initMonaco logic but we need to pass the "code" via dataset or reuse the existing editor instance if we kept it.
        // For simplicity, let's just use the dataset approach and call initMonaco. 
        // But wait, the previous instance is gone because we cleared innerHTML.
        // We set attributes for initMonaco to pick up.
        responseContainer.dataset.code = btoa(unescape(encodeURIComponent(displayText)));
        responseContainer.dataset.language = language;

        // Since it's in the viewport (user clicked submit), just init immediately
        initMonacoEditor(responseContainer);

    } catch (err) {
        console.error(err);
    }
}

function buildRequestFromForm(form, method, path) {
    const url = new URL(path, window.location.origin);
    const options = { method: method.toUpperCase(), headers: {} };

    // Get params
    const formData = new FormData(form);
    // FormData doesn't nicely give us "all inputs" if they are empty, so we iterate elements
    for (const input of form.elements) {
        if (!input.name) continue;
        const value = input.value;
        const paramIn = input.dataset.in;
        if (!value && !input.required) continue; // Skip empty optional

        if (paramIn === 'query') {
            url.searchParams.set(input.name, value);
        } else if (paramIn === 'header') {
            options.headers[input.name] = value;
        } else if (paramIn === 'path') {
            url.pathname = url.pathname.replace(`{${input.name}}`, encodeURIComponent(value));
        }
    }

    return { url: url.toString(), options };
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // alert('Copied!');
        // Could show a toast
    });
}

function buildCurl(form, method, path) {
    const { url, options } = buildRequestFromForm(form, method, path);
    let curl = `curl -X ${options.method} "${url}"`;
    for (const [k, v] of Object.entries(options.headers)) {
        curl += ` -H "${k}: ${v}"`;
    }
    return curl;
}

function buildFetch(form, method, path) {
    const { url, options } = buildRequestFromForm(form, method, path);
    return `fetch("${url}", ${JSON.stringify(options, null, 2)})`;
}
