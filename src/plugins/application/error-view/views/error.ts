import type { ShokupanContext } from '../../../../context';
import { readSourceContext } from '../util/source-reader';

interface StackFrame {
    method: string;
    file: string;
    line: number;
    column: number;
    isNative: boolean;
    isInternal: boolean; // node/bun
    isShokupan: boolean;
    isDependency: boolean; // node_modules
    shortFile: string;
    relativeFile: string;
}

export async function renderErrorView(ctx: ShokupanContext, error: any) {
    const frames: StackFrame[] = [];
    const cwd = process.cwd();

    // Safety check for error object
    const errorName = error?.name || 'Error';
    const errorMessage = error?.message || 'Unknown error occurred';

    const errorId = error?.id || ctx.requestId || 'unknown-id';
    const errorTimestamp = error?.timestamp ? new Date(error.timestamp).toISOString() : new Date().toISOString();
    const errorScope = error?.scope || {};

    // Parse stack trace (String parsing fallback)
    const lines = (error?.stack || '').split('\n').slice(1); // skip message
    for (const line of lines) {
        // Support: at method (file:line:col) OR at file:line:col
        const match = line.match(/at (?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?/);
        if (match) {
            const [_, method, file, lineNo, colNo] = match;
            const fileName = file || '';

            // Relativize path
            let relativeFile = fileName;
            if (fileName.startsWith(cwd)) {
                relativeFile = fileName.slice(cwd.length + 1); // +1 for slash/separator
            }

            // Classification Logic
            // 1. Internals: node:, bun:, or no file (native). Exception for timers.
            let isInternal = fileName.startsWith('node:') || fileName.startsWith('bun:') || fileName === 'undefined' || fileName === '';
            // Exception: setTimeout/setInterval/setImmediate are useful entrypoints
            if (isInternal && (method.includes('setTimeout') || method.includes('setInterval') || method.includes('setImmediate'))) {
                isInternal = false;
            }

            // 2. Shokupan: strictly source code or specific package match
            // NOT just matching the name in the path (which catches examples)
            let isShokupan = false;
            if (fileName.includes('node_modules/@dotglitch/shokupan')) {
                isShokupan = true;
            } else if (relativeFile.startsWith('src/') || fileName.includes('/shokupan/dist/')) {
                // In dev mode (monorepo), src/ is framework, but ensure we aren't misclassifying user src?
                // Current CWD is root of repo. 'src/' is framework. 'examples/' is user.
                isShokupan = true;
            }

            // 3. Dependencies: node_modules (generic), excluding Shokupan
            const isDependency = fileName.includes('node_modules') && !isShokupan;

            // 4. Native/Internal checks
            // (Refined above)

            frames.push({
                method: method || '<anonymous>',
                file: fileName,
                line: parseInt(lineNo),
                column: parseInt(colNo),
                isNative: false,
                isInternal,
                isShokupan,
                isDependency,
                shortFile: fileName.split('/').pop() || fileName,
                relativeFile
            });
        }
    }

    // Determine "Best" Frame for Code Viewer
    let focusFrame = frames.find(f => !f.isInternal && !f.isShokupan && !f.isDependency && !f.isNative);
    if (!focusFrame) focusFrame = frames[0];

    // Read Source Context
    let sourceContext = null;
    if (focusFrame && focusFrame.file && !focusFrame.isInternal) {
        sourceContext = await readSourceContext(focusFrame.file, focusFrame.line, 8);
    }

    // Render Frames with Hyperlinks
    const renderFrames = frames.map((frame, index) => {
        const classes = [
            'stack-entry',
            frame.isInternal ? 'internal' : '',
            frame.isShokupan ? 'shokupan' : '',
            frame.isDependency ? 'dependency' : '',
            frame === focusFrame ? 'active' : ''
        ].join(' ');

        const fileLink = `vscode://file/${frame.file}:${frame.line}:${frame.column}`;

        return `
            <li class="${classes}">
                <a href="${fileLink}" style="text-decoration:none; color:inherit; display:block">
                    <div class="stack-method">${frame.method === '<anonymous>' ? 'Anonymous' : frame.method}</div>
                    <div class="stack-file">${frame.relativeFile}:${frame.line}</div>
                </a>
            </li>
        `;
    }).join('');

    // Code Block
    // Syntax Highlighter (Simple Regex-based)
    const highlightCode = (code: string) => {
        return code
            .replace(/</g, '&lt;').replace(/>/g, '&gt;') // Escape HTML first
            // Strings (double quoted)
            .replace(/(")(.*?)(")/g, '<span style="color:#a5d6ff">$1$2$3</span>')
            // Strings (single quoted)
            .replace(/(')(.*?)(')/g, '<span style="color:#a5d6ff">$1$2$3</span>')
            // Strings (backticks - simplistic)
            .replace(/(`)(.*?)(`)/g, '<span style="color:#a5d6ff">$1$2$3</span>')
            // Keywords
            .replace(/\b(const|let|var|function|class|import|export|from|return|if|else|switch|case|default|break|continue|try|catch|finally|throw|new|async|await|interface|type|extends|implements|public|private|protected|static|readonly|true|false|null|undefined)\b/g, '<span style="color:#ff7b72">$1</span>')
            // Control flow / operators
            .replace(/(=>|===|==|!=|!==|\|\||&&|\+|\-|\*|\/|%|\+\+|\-\-)/g, '<span style="color:#ff7b72">$1</span>')
            // Types / Classes (Capitalized words)
            .replace(/\b([A-Z][a-zA-Z0-9_]*)\b/g, '<span style="color:#79c0ff">$1</span>')
            // Function calls (word followed by paren)
            .replace(/\b([a-zA-Z0-9_]+)(?=\()/g, '<span style="color:#d2a8ff">$1</span>')
            // Comments (double slash) - tricky with regex, simpler to do distinct pass or match carefully. 
            // Simple approach for single line comments:
            .replace(/(\/\/.*)/g, '<span style="color:#8b949e; font-style:italic">$1</span>');
    };

    // Code Block
    let codeBlock = '';
    if (sourceContext) {
        const lines = sourceContext.lines.map(l => `
            <div class="code-line ${l.isTarget ? 'target' : ''}">
                <div class="line-number">${l.line}</div>
                <div class="line-content">${highlightCode(l.code)}</div>
            </div>
        `).join('');
        codeBlock = lines;
    } else {
        codeBlock = `<div style="padding: 2rem; color: var(--text-muted); text-align: center;">Source code not available.</div>`;
    }

    // Advanced KV Renderer
    const renderKV = (data: Record<string, any>) => {
        if (!data || Object.keys(data).length === 0) return '<div style="color:var(--text-muted)">None</div>';

        return `<table class="kv-table">
            ${Object.entries(data).map(([k, v]) => {
            let displayVal = String(v);
            let valClass = '';

            if (typeof v === 'number') {
                valClass = 'kv-val-number';
            } else if (typeof v === 'boolean') {
                valClass = 'kv-val-bool';
            } else if (typeof v === 'object' && v !== null) {
                try {
                    displayVal = JSON.stringify(v, null, 2);
                    valClass = 'kv-val-json';
                } catch (e) { displayVal = '[Circular]'; }
            }

            return `
                <tr>
                    <td class="kv-key">${k}</td>
                    <td class="kv-val ${valClass}">${displayVal}</td>
                </tr>`;
        }).join('')}
        </table>`;
    };

    // Copy Icons
    const ICON_COPY = `<svg class="icon" viewBox="0 0 24 24"><path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"/></svg>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${errorName}: ${errorMessage}</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/line-numbers/prism-line-numbers.min.css" rel="stylesheet" />
    <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/line-highlight/prism-line-highlight.min.css" rel="stylesheet" />
    <link href="/_shokupan/error-view/prismjs.theme.css" rel="stylesheet" />
    <link href="/_shokupan/error-view/styles.css" rel="stylesheet" />
    <link href="/_shokupan/error-view/theme.css" rel="stylesheet" />

</head>
<body class="">
    
    <div class="page">
        <!-- HEADER -->
        <header class="chapter-header">
            <div class="chapter-meta">
                <div class="meta-item">
                     <span>${ctx.method}</span>
                </div>
                <div class="meta-item">
                     <span>${ctx.url.pathname}</span>
                </div>
                <div class="meta-item">
                     <span>${ctx.response.status || 500}</span>
                </div>
                <div class="meta-item" style="margin-left:auto">
                     <span class="id-badge" onclick="copyText('${errorId}')" title="Copy ID">ID: ${errorId}</span>
                </div>
            </div>
            
            <h1 class="error-title">${errorName}</h1>
            
            <div class="error-message-container">
                <h2 class="error-message">${errorMessage}</h2>
                <button class="action-btn" onclick="copyText('${(errorMessage || '').replace(/'/g, "\\'")}')" title="Copy Message" style="padding:4px 8px">
                    ${ICON_COPY}
                </button>
            </div>
            
            <div class="actions-bar">
                <button class="action-btn" onclick="copyText()">
                    ${ICON_COPY} Copy Error
                </button>
                <button class="action-btn" onclick="document.getElementById('raw-modal').style.display='flex'">
                     View Raw Error
                </button>
            </div>
        </header>

        <!-- CODE FIGURE -->
        <section class="figure">
            <div class="figure-caption">
                ${focusFrame ? `<a href="vscode://file${focusFrame.file}:${focusFrame.line}" style="color:var(--text-muted); text-decoration:none">${focusFrame ? focusFrame.relativeFile : (sourceContext?.file || 'Unknown Source')}</a>` : ''}
            </div>
            <div class="figure-body">
                ${sourceContext ? `
                <pre class="line-numbers" data-line="${sourceContext.lines.find(l => l.isTarget)?.line}" data-start="${sourceContext.lines[0].line}"><code class="language-typescript">${sourceContext.lines.map(l => l.code.replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('\n')}</code></pre>
                ` : `<div style="padding: 2rem; color: var(--text-muted); text-align: center;">Source code not available.</div>`}
            </div>
        </section>

        <!-- NARRATIVE STACK -->
        <section class="narrative">
            <div class="section-title">
                <span>Stack Trace</span>
                <div class="filter-group">
                    <span class="badge" onclick="this.classList.toggle('active'); document.body.classList.toggle('show-internals')">Internals</span>
                    <span class="badge" onclick="this.classList.toggle('active'); document.body.classList.toggle('show-shokupan')">Framework</span>
                    <span class="badge" onclick="this.classList.toggle('active'); document.body.classList.toggle('show-dependencies')">Dependencies</span>
                </div>
            </div>
            <ul class="stack-list">
                ${renderFrames}
            </ul>
        </section>

        <!-- APPENDICES -->
        <section class="appendix">
             <div class="section-title">Context & Environment</div>
             <div class="appendix-grid">
                 <div class="data-block">
                     <h3>Request</h3>
                     ${renderKV({
        id: errorId,
        timestamp: errorTimestamp,
        ... (errorScope || {})
    })}
                 </div>
                 <div class="data-block">
                     <h3>Headers</h3>
                     ${renderKV(Object.fromEntries(ctx.headers))}
                 </div>
                 <div class="data-block">
                     <h3>Query & Params</h3>
                     ${renderKV({ ...ctx.params, ...ctx.query })}
                 </div>
             </div>
        </section>
    </div>
    
    <!-- RAW ERROR MODAL -->
    <div id="raw-modal" class="modal-overlay" onclick="if(event.target === this) this.style.display='none'">
        <div class="modal-content">
            <div class="modal-header">
                <span>Raw Error Object</span>
                <button class="action-btn" onclick="document.getElementById('raw-modal').style.display='none'">Close</button>
            </div>
            <div class="modal-body" id="raw-content"></div>
        </div>
    </div>

    <!-- PrismJS Scripts -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-typescript.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/line-numbers/prism-line-numbers.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/line-highlight/prism-line-highlight.min.js"></script>

    <script>
        // Prepare Raw Error
        // circular ref safe stringify
        const getCircularReplacer = () => {
          const seen = new WeakSet();
          return (key, value) => {
            if (typeof value === "object" && value !== null) {
              if (seen.has(value)) {
                return "[Circular]";
              }
              seen.add(value);
            }
            return value;
          };
        };
        
        // Inject error data from SERVER side
        const rawError = ${(() => {
            // Helper to serialize Error objects including non-enumerable properties
            const serializeError = (err: any) => {
                const obj: any = {
                    name: err.name,
                    message: err.message,
                    stack: err.stack,
                    ...err // Spread enumerable props
                };

                // Explicitly grab other common props if they exist
                if (err.cause) obj.cause = err.cause;
                if (err.code) obj.code = err.code;
                if (err.status) obj.status = err.status;
                if (err.statusCode) obj.statusCode = err.statusCode;

                return JSON.stringify(obj, (key, value) => {
                    // Filter out redundant large stack
                    if (key === 'structuredStack') return undefined;
                    return value;
                }, 2);
            };
            // EXECUTE on Server Side
            return serializeError(error);
        })()};
        
        // At this point 'rawError' is an Object in Client JS (because serializeError returned a JSON string)
        const RAW_ERROR_JSON = JSON.stringify(rawError, getCircularReplacer(), 2);
        // "Normally printed" usually means standard stacktrace string which includes name/message
        const RAW_ERROR_TEXT = rawError.stack || (rawError.name + ': ' + rawError.message);
        
        document.getElementById('raw-content').innerText = RAW_ERROR_JSON;

        function copyText(text) {
             if (!text) text = RAW_ERROR_TEXT; // Default to text representation (Message + Stack)
             navigator.clipboard.writeText(text).then(() => {
                console.log('Copied');
             });
        }
    </script>
</body>
</html>`;
}
