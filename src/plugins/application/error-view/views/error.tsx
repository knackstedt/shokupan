import renderToString from 'preact-render-to-string';
import type { ShokupanContext } from '../../../../context';
import { escapeHtml } from '../../../../util/html';
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

interface SourceContext {
    lines: {
        line: number;
        code: string;
        isTarget: boolean;
    }[];
    startLine: number;
    file: string;
}

// Copy Icon SVG
const CopyIcon = () => (
    <svg class="icon" viewBox="0 0 24 24">
        <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" />
    </svg>
);

interface ErrorHeaderProps {
    ctx: ShokupanContext;
    errorName: string;
    errorMessage: string;
    errorId: string;
}

const ErrorHeader = ({ ctx, errorName, errorMessage, errorId }: ErrorHeaderProps) => (
    <header class="chapter-header">
        <div class="chapter-meta">
            <div class="meta-item">
                <span>{ctx.method}</span>
            </div>
            <div class="meta-item">
                <span>{ctx.url.pathname}</span>
            </div>
            <div class="meta-item">
                <span>{ctx.response.status || 500}</span>
            </div>
            <div class="meta-item" style="margin-left:auto">
                <span class="id-badge" onclick={`copyText('${escapeHtml(errorId)}')`} title="Copy ID">
                    ID: {errorId}
                </span>
            </div>
        </div>

        <h1 class="error-title">{errorName}</h1>

        <div class="error-message-container">
            <h2 class="error-message">{errorMessage}</h2>
            <button
                class="action-btn"
                onclick={`copyText('${(escapeHtml(errorMessage) || '').replace(/'/g, "\\'")}')`}
                title="Copy Message"
                style="padding:4px 8px"
            >
                <CopyIcon />
            </button>
        </div>

        <div class="actions-bar">
            <button class="action-btn" onclick="copyText()">
                <CopyIcon /> Copy Error
            </button>
            <button class="action-btn" onclick="document.getElementById('raw-modal').style.display='flex'">
                View Raw Error
            </button>
        </div>
    </header>
);

interface CodeFigureProps {
    focusFrame: StackFrame | undefined;
    sourceContext: SourceContext | null;
}

const CodeFigure = ({ focusFrame, sourceContext }: CodeFigureProps) => (
    <section class="figure">
        <div class="figure-caption">
            {focusFrame && (
                <a
                    href={`vscode://file${encodeURI(focusFrame.file)}:${focusFrame.line}`}
                    style="color:var(--text-muted); text-decoration:none"
                >
                    {focusFrame.relativeFile}
                </a>
            )}
        </div>
        <div class="figure-body">
            {sourceContext ? (
                <pre
                    class="shj-lang-ts"
                    data-line={sourceContext.lines.find(l => l.isTarget)?.line}
                    data-start={sourceContext.lines[0].line}
                >
                    <code>
                        {sourceContext.lines.map(l => l.code).join('\n')}
                    </code>
                </pre>
            ) : (
                <div style="padding: 2rem; color: var(--text-muted); text-align: center;">
                    Source code not available.
                </div>
            )}
        </div>
    </section>
);

interface StackTraceProps {
    frames: StackFrame[];
    focusFrame: StackFrame | undefined;
}

const StackTrace = ({ frames, focusFrame }: StackTraceProps) => {
    const renderFrames = frames.map((frame) => {
        const classes = [
            'stack-entry',
            frame.isInternal ? 'internal' : '',
            frame.isShokupan ? 'shokupan' : '',
            frame.isDependency ? 'dependency' : '',
            frame === focusFrame ? 'active' : ''
        ].join(' ');

        const fileLink = `vscode://file/${encodeURI(frame.file)}:${frame.line}:${frame.column}`;

        return (
            <li class={classes}>
                <a href={fileLink} style="text-decoration:none; color:inherit; display:block">
                    <div class="stack-method">
                        {frame.method === '<anonymous>' ? 'Anonymous' : frame.method}
                    </div>
                    <div class="stack-file">{frame.relativeFile}:{frame.line}</div>
                </a>
            </li>
        );
    });

    return (
        <section class="narrative">
            <div class="section-title">
                <span>Stack Trace</span>
                <div class="filter-group">
                    <span class="badge" onclick="this.classList.toggle('active'); document.body.classList.toggle('show-internals')">
                        Internals
                    </span>
                    <span class="badge" onclick="this.classList.toggle('active'); document.body.classList.toggle('show-shokupan')">
                        Framework
                    </span>
                    <span class="badge" onclick="this.classList.toggle('active'); document.body.classList.toggle('show-dependencies')">
                        Dependencies
                    </span>
                </div>
            </div>
            <ul class="stack-list">
                {renderFrames}
            </ul>
        </section>
    );
};

interface KeyValueTableProps {
    data: Record<string, any>;
}

const KeyValueTable = ({ data }: KeyValueTableProps) => {
    if (!data || Object.keys(data).length === 0) {
        return <div style="color:var(--text-muted)">None</div>;
    }

    const rows = Object.entries(data).map(([k, v]) => {
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
            } catch (e) {
                displayVal = '[Circular]';
            }
        }

        return (
            <tr>
                <td class="kv-key">{k}</td>
                <td class={`kv-val ${valClass}`}>{displayVal}</td>
            </tr>
        );
    });

    return (
        <table class="kv-table">
            {rows}
        </table>
    );
};

interface ContextDataProps {
    errorId: string;
    errorTimestamp: string;
    errorScope: any;
    ctx: ShokupanContext;
}

const ContextData = ({ errorId, errorTimestamp, errorScope, ctx }: ContextDataProps) => (
    <section class="appendix">
        <div class="section-title">Context & Environment</div>
        <div class="appendix-grid">
            <div class="data-block">
                <h3>Request</h3>
                <KeyValueTable data={{
                    id: errorId,
                    timestamp: errorTimestamp,
                    ...(errorScope || {})
                }} />
            </div>
            <div class="data-block">
                <h3>Headers</h3>
                <KeyValueTable data={Object.fromEntries(ctx.headers)} />
            </div>
            <div class="data-block">
                <h3>Query & Params</h3>
                <KeyValueTable data={{ ...ctx.params, ...ctx.query }} />
            </div>
        </div>
    </section>
);

interface RawErrorModalProps {
    error: any;
}

const RawErrorModal = ({ error }: RawErrorModalProps) => {
    // Serialize error for client-side
    const serializeError = (err: any) => {
        const obj: any = {
            name: err.name,
            message: err.message,
            stack: err.stack,
            ...err
        };

        if (err.cause) obj.cause = err.cause;
        if (err.code) obj.code = err.code;
        if (err.status) obj.status = err.status;
        if (err.statusCode) obj.statusCode = err.statusCode;

        return JSON.stringify(obj, (key, value) => {
            if (key === 'structuredStack') return undefined;
            return value;
        }, 2).replace(/<\/script>/g, '<\\/script>');
    };

    const rawErrorJson = serializeError(error);

    return (
        <>
            <div id="raw-modal" class="modal-overlay" onclick="if(event.target === this) this.style.display='none'">
                <div class="modal-content">
                    <div class="modal-header">
                        <span>Raw Error Object</span>
                        <button class="action-btn" onclick="document.getElementById('raw-modal').style.display='none'">
                            Close
                        </button>
                    </div>
                    <div class="modal-body" id="raw-content"></div>
                </div>
            </div>
            <script dangerouslySetInnerHTML={{
                __html: `
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
                    
                    const rawError = ${rawErrorJson};
                    const RAW_ERROR_JSON = JSON.stringify(rawError, getCircularReplacer(), 2);
                    const RAW_ERROR_TEXT = rawError.stack || (rawError.name + ': ' + rawError.message);
                    
                    document.getElementById('raw-content').innerText = RAW_ERROR_JSON;

                    function copyText(text) {
                        if (!text) text = RAW_ERROR_TEXT;
                        navigator.clipboard.writeText(text).then(() => {
                            console.log('Copied');
                        });
                    }
                `
            }} />
        </>
    );
};

interface ErrorPageProps {
    ctx: ShokupanContext;
    errorName: string;
    errorMessage: string;
    errorId: string;
    errorTimestamp: string;
    errorScope: any;
    frames: StackFrame[];
    focusFrame: StackFrame | undefined;
    sourceContext: SourceContext | null;
    error: any;
    hideCode?: boolean;
    hideStacktrace?: boolean;
}

const ErrorPage = ({
    ctx,
    errorName,
    errorMessage,
    errorId,
    errorTimestamp,
    errorScope,
    frames,
    focusFrame,
    sourceContext,
    error,
    hideCode = false,
    hideStacktrace = false
}: ErrorPageProps) => (
    <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <title>{errorName}: {errorMessage}</title>
            <link href="https://unpkg.com/@speed-highlight/core@latest/dist/themes/visual-studio-dark.css" rel="stylesheet" />
            <link href="/_shokupan/error-view/styles.css" rel="stylesheet" />
            <link href="/_shokupan/error-view/theme.css" rel="stylesheet" />
        </head>
        <body class="">
            <div class="page">
                <ErrorHeader
                    ctx={ctx}
                    errorName={errorName}
                    errorMessage={errorMessage}
                    errorId={errorId}
                />
                {!hideCode && (
                    <CodeFigure
                        focusFrame={focusFrame}
                        sourceContext={sourceContext}
                    />
                )}
                {!hideStacktrace && (
                    <StackTrace
                        frames={frames}
                        focusFrame={focusFrame}
                    />
                )}
                <ContextData
                    errorId={errorId}
                    errorTimestamp={errorTimestamp}
                    errorScope={errorScope}
                    ctx={ctx}
                />
            </div>
            <RawErrorModal error={error} />

            <script type="module" dangerouslySetInnerHTML={{
                __html: `
                    import { highlightAll } from 'https://unpkg.com/@speed-highlight/core@latest/dist/index.js';
                    // Initialize speed-highlight
                    document.addEventListener('DOMContentLoaded', () => {
                        highlightAll();
                        
                        // Add line numbers
                        document.querySelectorAll('pre[data-start]').forEach(pre => {
                            const startLine = parseInt(pre.getAttribute('data-start')) || 1;
                            const targetLine = parseInt(pre.getAttribute('data-line'));
                            const code = pre.querySelector('code');
                            if (!code) return;
                            
                            const lines = code.textContent.split('\\n');
                            let html = '';
                            lines.forEach((line, idx) => {
                                const lineNum = startLine + idx;
                                const isTarget = lineNum === targetLine;
                                html += \`<span class="line-wrapper\${isTarget ? ' highlight-line' : ''}">\`;
                                html += \`<span class="line-number">\${lineNum}</span>\`;
                                html += \`<span class="line-code">\${line || ' '}</span>\`;
                                html += '</span>';
                            });
                            code.innerHTML = html;
                        });
                    });
                `
            }} />
        </body>
    </html>
);

export async function renderErrorView(ctx: ShokupanContext, error: any, options: { hideCode?: boolean, hideStacktrace?: boolean; } = {}) {
    const frames: StackFrame[] = [];
    const cwd = process.cwd();

    // Safety check for error object
    const errorName = error?.name || 'Error';
    const errorMessage = error?.message || 'Unknown error occurred';
    const errorId = error?.id || ctx.requestId || 'unknown-id';
    const errorTimestamp = error?.timestamp ? new Date(error.timestamp).toISOString() : new Date().toISOString();
    const errorScope = error?.scope || {};

    // Parse stack trace
    const lines = (error?.stack || '').split('\n').slice(1); // skip message
    for (const line of lines) {
        const match = line.match(/at (?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?/);
        if (match) {
            const [_, method, file, lineNo, colNo] = match;
            const fileName = file || '';

            // Relativize path
            let relativeFile = fileName;
            if (fileName.startsWith(cwd)) {
                relativeFile = fileName.slice(cwd.length + 1);
            }

            // Classification Logic
            let isInternal = fileName.startsWith('node:') || fileName.startsWith('bun:') || fileName === 'undefined' || fileName === '';
            if (isInternal && (method?.includes('setTimeout') || method?.includes('setInterval') || method?.includes('setImmediate'))) {
                isInternal = false;
            }

            let isShokupan = false;
            if (fileName.includes('node_modules/@dotglitch/shokupan')) {
                isShokupan = true;
            } else if (relativeFile.startsWith('src/') || fileName.includes('/shokupan/dist/')) {
                isShokupan = true;
            }

            const isDependency = fileName.includes('node_modules') && !isShokupan;

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

    const element = ErrorPage({
        ctx,
        errorName,
        errorMessage,
        errorId,
        errorTimestamp,
        errorScope,
        frames,
        focusFrame,
        sourceContext,
        error,
        hideCode: options.hideCode,
        hideStacktrace: options.hideStacktrace
    });

    return '<!DOCTYPE html>\n' + renderToString(element);
}
