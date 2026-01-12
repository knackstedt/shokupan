// Client-side JavaScript for API Explorer
document.addEventListener('DOMContentLoaded', () => {
    renderMarkdown();
    setupSidebar();
    setupMonaco();
    setupTester();
});

function renderMarkdown() {
    if (typeof marked === 'undefined') {
        setTimeout(renderMarkdown, 100);
        return;
    }

    document.querySelectorAll('[data-markdown="true"]').forEach(el => {
        const markdown = el.textContent;
        if (markdown && markdown.trim()) {
            el.innerHTML = marked.parse(markdown);
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

    if (resizeHandle) {
        let isResizing = false;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            let newWidth = e.clientX;
            if (newWidth < 150) newWidth = 150;
            if (newWidth > 600) newWidth = 600;

            document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
        });
    }
}

function setupMonaco() {
    if (typeof require === 'undefined') {
        console.warn('Monaco loader not available');
        return;
    }

    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });

    require(['vs/editor/editor.main'], function () {
        // Initialize all Monaco editors (code blocks and response viewers)
        document.querySelectorAll('.monaco-editor').forEach(el => {
            const code = el.dataset.code ? atob(el.dataset.code) : '';
            const lang = el.dataset.language || 'typescript';
            const isReadOnly = el.classList.contains('read-only');

            const lineHeight = 18;
            el.style.height = ((code.match(/\n/g)?.length + 1) * lineHeight + 12) + 'px' || '30px';
            el.style.border = '1px solid var(--color-border-primary)';
            el.style.marginTop = '0.5rem';

            monaco.editor.create(el, {
                value: code,
                language: lang,
                theme: 'vs-dark',
                readOnly: isReadOnly,
                minimap: { enabled: false },
                colorDecorators: true,
                readOnly: true,
                lineHeight: lineHeight,
                fontSize: parseInt(window.getComputedStyle(el)?.fontSize?.replace('px', '')) || 13,
                mouseWheelScrollSensitivity: 2,
                scrollbar: {
                    alwaysConsumeMouseWheel: false
                },
                smoothScrolling: true,
                scrollBeyondLastLine: false,
                automaticLayout: true
            });
        });
    });
}

function setupTester() {
    document.querySelectorAll('.tester-form').forEach(form => {
        const method = form.dataset.method;
        const path = form.dataset.path;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await sendRequest(form, method, path);
        });

        // Copy buttons
        form.querySelector('.copy-curl')?.addEventListener('click', () => {
            const request = buildRequestFromForm(form, method, path);
            copyToClipboard(generateCurl(request));
        });

        form.querySelector('.copy-fetch')?.addEventListener('click', () => {
            const request = buildRequestFromForm(form, method, path);
            copyToClipboard(generateFetch(request));
        });
    });
}

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

        // Try to parse as JSON for better formatting
        let displayText = bodyText;
        let language = 'text';
        try {
            const json = JSON.parse(bodyText);
            displayText = JSON.stringify(json, null, 2);
            language = 'json';
        } catch { }

        // Use Monaco if available, otherwise plain text
        if (typeof monaco !== 'undefined' && responseContainer) {
            const lineHeight = 18;
            responseContainer.style.height = (displayText.match(/\n/g)?.length * lineHeight) + 'px' || '30px';
            responseContainer.style.border = '1px solid var(--color-border-primary)';
            responseContainer.innerHTML = '';

            monaco.editor.create(responseContainer, {
                value: displayText,
                language: language,
                theme: 'vs-dark',
                colorDecorators: true,
                readOnly: true,
                lineHeight: lineHeight + 6,
                minimap: { enabled: false },
                fontSize: parseInt(window.getComputedStyle(responseContainer)?.fontSize?.replace('px', '')) || 13,
                mouseWheelScrollSensitivity: 2,
                scrollbar: {
                    alwaysConsumeMouseWheel: false
                },
                smoothScrolling: true,
                scrollBeyondLastLine: false,
                automaticLayout: true
            });
        } else {
            responseContainer.innerHTML = `<pre style="margin: 0; padding: 1rem; background: var(--bg-primary); overflow: auto;">${displayText}</pre>`;
        }
    } catch (err) {
        const statusCode = responseViewer.querySelector('.status-code');
        const responseContainer = responseViewer.querySelector('.monaco-response');

        statusCode.textContent = 'Error';
        statusCode.className = 'status-code error';
        responseContainer.innerHTML = `<pre style="margin: 0; padding: 1rem; color: var(--color-error);">${err.message}</pre>`;
    }
}

function buildRequestFromForm(form, method, path) {
    const url = new URL(path, window.location.origin);
    const options = { method: method.toUpperCase(), headers: {} };

    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
        const input = form.elements[key];
        const paramIn = input?.dataset?.in;

        if (!value || !paramIn) continue;

        if (paramIn === 'query') {
            url.searchParams.set(key, value);
        } else if (paramIn === 'header') {
            options.headers[key] = value;
        } else if (paramIn === 'path') {
            url.pathname = url.pathname.replace(`{${key}}`, encodeURIComponent(value));
        }
    }

    return {
        url: url.toString(),
        options
    };
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        console.log('Copied to clipboard');
    });
}

function generateCurl(req) {
    let cmd = `curl -X ${req.options.method} "${req.url}"`;
    Object.entries(req.options.headers).forEach(([k, v]) => {
        cmd += ` -H "${k}: ${v}"`;
    });
    if (req.options.body) {
        cmd += ` -d '${req.options.body}'`;
    }
    return cmd;
}

function generateFetch(req) {
    return `fetch("${req.url}", ${JSON.stringify(req.options, null, 2)})
  .then(res => res.json())
  .then(data => console.log(data));`;
}
