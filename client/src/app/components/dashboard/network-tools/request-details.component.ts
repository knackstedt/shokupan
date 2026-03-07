import { CommonModule, KeyValuePipe } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { MonacoEditorComponent } from '@dotglitch/ngx-common/monaco-editor';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { ButtonModule } from 'primeng/button';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { TooltipModule } from 'primeng/tooltip';
import { HeaderTokensPipe } from './header-tokens.pipe';
import { getHeaderUrl, getStatusCodeUrl, isHeaderDocumented } from './http-reference.data';
import { NetworkRequest, formatBytes, formatDurationPretty, generateCurlCode, generateFetchCode, generateHAR } from './network-utils';
import { isSupportedEncoding } from './util/decompression';
@Component({
    selector: 'skp-request-details',
    standalone: true,
    imports: [
        CommonModule,
        Tabs,
        TabList,
        Tab,
        TabPanels,
        TabPanel,
        ButtonModule,
        TooltipModule,
        KeyValuePipe,
        NgScrollbarModule,
        MonacoEditorComponent,
        HeaderTokensPipe
    ],
    templateUrl: './request-details.component.html',
    styleUrl: './request-details.component.scss',
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class RequestDetailsComponent {
    request = input.required<NetworkRequest>();
    onClose = output<void>();

    private worker: Worker | null = null;

    private destroyRef = inject(DestroyRef);

    readonly activeTab = signal<string | number>('headers');

    readonly decodedBody = signal<string | null>(null);
    readonly isDecoding = signal(false);

    readonly loadedRequestBody = signal<any>(null);
    readonly loadedResponseBody = signal<any>(null);
    readonly isLoadingPayload = signal(false);

    constructor() {
        this.destroyRef.onDestroy(() => {
            this.worker?.terminate();
        });

        // Effect for request change: reset states
        effect(() => {
            const _ = this.request();
            this.decodedBody.set(null);
            this.isDecoding.set(false);
            this.loadedRequestBody.set(null);
            this.loadedResponseBody.set(null);
            this.isLoadingPayload.set(false);

            if (this.worker) {
                this.worker.terminate();
                this.worker = null;
            }
        });

        // Effect for tab change: load payload if needed
        effect(() => {
            const tab = this.activeTab();
            const req = this.request();

            if (tab === 'payload' && !this.loadedRequestBody() && req.hasRequestBody) {
                this.loadPayload('request');
            } else if (tab === 'response' && !this.loadedResponseBody() && req.hasResponseBody) {
                this.loadPayload('response');
            }
        });

        // Effect for decompression: trigger when response body is loaded and has compression
        effect(() => {
            const req = this.request();
            const body = this.loadedResponseBody();
            if (this.hasCompression() && body && !this.decodedBody() && !this.isDecoding()) {
                this.triggerDecompression();
            }
        });
    }

    readonly hasCompression = computed(() => {
        const req = this.request();
        const encoding = req.responseHeaders?.['content-encoding'] || req.responseHeaders?.['Content-Encoding'];
        return isSupportedEncoding(encoding);
    });

    /** Parse query parameters from the request URL */
    readonly queryParams = computed(() => {
        try {
            const u = new URL(this.request().url);
            return [...u.searchParams.entries()];
        } catch {
            const qs = this.request().url.split('?')[1];
            if (!qs) return [];
            return qs.split('&').map(p => {
                const [k, ...v] = p.split('=');
                return [decodeURIComponent(k), decodeURIComponent(v.join('='))] as [string, string];
            });
        }
    });

    /** True when this request is a WebSocket upgrade */
    readonly isWs = computed(() =>
        this.request().type === 'ws' || this.request().status === 101
    );

    /** Split the handler stack into middleware and final route handlers */
    readonly handlerGroups = computed(() => {
        const stack = this.request().handlerStack ?? [];
        if (stack.length === 0) return { middleware: [], finalHandlers: [] };

        // The last item is always the final handler
        const middleware = stack.slice(0, -1);
        const finalHandlers = stack.slice(-1);

        return { middleware, finalHandlers };
    });

    /** Aggregate stats across all WS messages */
    readonly wsStats = computed(() => {
        const msgs = this.request().wsMessages ?? [];
        // Only count actual data messages, not system events (open/close/error)
        const dataMsgs = msgs.filter((m: any) => m.type === 'message');
        const inbound = dataMsgs.filter((m: any) => m.dir === 'in');
        const outbound = dataMsgs.filter((m: any) => m.dir === 'out');
        const bytesIn = inbound.reduce((s: number, m: any) => s + (m.size ?? m.data?.length ?? 0), 0);
        const bytesOut = outbound.reduce((s: number, m: any) => s + (m.size ?? m.data?.length ?? 0), 0);
        const start = this.request().timestamp;
        const last = msgs.length ? Math.max(...msgs.map((m: any) => m.timestamp)) : start;
        return {
            total: dataMsgs.length, inbound: inbound.length, outbound: outbound.length,
            bytesIn, bytesOut, durationMs: last - start
        };
    });

    /**
     * Map each WS message to an (x, dir) point for the timeline SVG chart.
     * x is a 0–1 fraction of the total connection duration.
     */
    readonly wsTimelinePoints = computed(() => {
        const msgs = this.request().wsMessages ?? [];
        if (!msgs.length) return [];
        const start = this.request().timestamp;
        const end = Math.max(...msgs.map((m: any) => m.timestamp));
        const span = end - start || 1;
        return msgs.map((m: any) => ({
            x: (m.timestamp - start) / span,
            dir: (m.dir ?? 'system') as 'in' | 'out' | 'system',
            type: m.type as string,
            data: m.data,
            t: m.timestamp - start,
        }));
    });

    /**
     * Classify a header value into a semantic CSS class for color-coding.
     * Classes: hl-auth, hl-mime, hl-num, hl-date, hl-bool, hl-url, hl-default
     */
    headerValueClass(key: string, value: string): string {
        const k = key.toLowerCase();
        const v = (value || '').trim();

        // Auth / security
        if (k === 'authorization' || k === 'proxy-authorization' || k === 'www-authenticate')
            return 'hl-auth';
        if (k === 'cookie' || k === 'set-cookie')
            return 'hl-cookie';

        // MIME / content type
        if (k === 'content-type' || k === 'accept' || k === 'accept-encoding' || k === 'accept-language')
            return 'hl-mime';

        // URL / location
        if (k === 'location' || k === 'referer' || k === 'origin' || k === 'host' || k === 'x-forwarded-for')
            return 'hl-url';

        // Date-like
        if (k === 'date' || k === 'last-modified' || k === 'expires' || k === 'if-modified-since')
            return 'hl-date';

        // Numeric values (content-length, status codes, cache-control maxage etc.)
        if (/^[\d.,; ]+$/.test(v) || k === 'content-length' || k === 'age' || k === 'max-age')
            return 'hl-num';

        // Booleans / simple flags
        if (v === 'true' || v === 'false' || v === 'no-cache' || v === 'no-store')
            return 'hl-bool';

        return 'hl-default';
    }

    /** Classify a query param value for color coding */
    queryParamClass(value: string): string {
        const v = value.trim();
        if (/^-?[\d.]+$/.test(v)) return 'hl-num';
        if (v === 'true' || v === 'false') return 'hl-bool';
        if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/')) return 'hl-url';
        return 'hl-string';
    }

    /** Serialize body to a pretty-printed string for Monaco */
    bodyString(body: any): string {
        if (!body) return '';

        let target = body;
        // If it's a string, try to see if it's a stringified binary object
        if (typeof body === 'string') {
            if (body.startsWith('{') && body.includes('__binary')) {
                try {
                    const parsed = JSON.parse(body);
                    if (parsed && typeof parsed === 'object' && parsed.__binary) {
                        target = parsed;
                    }
                } catch { }
            } else {
                return body;
            }
        }

        // Handle our special binary object
        if (target && typeof target === 'object' && target.__binary) {
            return this.getBinaryPlaceholder(target);
        }

        // If it's an object but not our binary one, stringify it
        if (target && typeof target === 'object') {
            try {
                return JSON.stringify(target, null, 2);
            } catch {
                return '[Non-serializable Object]';
            }
        }

        return String(target);
    }

    private getBinaryPlaceholder(body: any): string {
        return `[Binary Data: ${body.length || 0} bytes]`;
    }

    /** Detect language for Monaco from the content-type or body shape */
    bodyLanguage(body: any, contentType?: string): string {
        if (body && typeof body === 'object' && body.__binary) return 'plaintext';
        const ct = (contentType || '').toLowerCase();
        if (ct.includes('json') || (typeof body === 'object' && body !== null && !body.__binary)) return 'json';
        if (ct.includes('html') || (typeof body === 'string' && body.trimStart().startsWith('<'))) return 'html';
        if (ct.includes('xml')) return 'xml';
        if (ct.includes('css')) return 'css';
        if (ct.includes('javascript') || ct.includes('js')) return 'javascript';
        return 'plaintext';
    }

    async loadPayload(type: 'request' | 'response') {
        const req = this.request();
        this.isLoadingPayload.set(true);

        try {
            const res = await fetch(`/dashboard/requests/${req.id}/payload/${type}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const contentType = res.headers.get('content-type') || '';
            let data: any;

            if (contentType.includes('application/json')) {
                data = await res.json();
            } else if (contentType.includes('text/')) {
                data = await res.text();
            } else {
                // Binary data - Handle large buffers by chunking to avoid stack limits
                const buffer = await res.arrayBuffer();
                const uint8 = new Uint8Array(buffer);
                let binary = '';
                const chunkSize = 8192;
                for (let i = 0; i < uint8.length; i += chunkSize) {
                    binary += String.fromCharCode(...uint8.slice(i, i + chunkSize));
                }

                data = {
                    __binary: true,
                    data: btoa(binary),
                    length: buffer.byteLength
                };
            }

            if (type === 'request') this.loadedRequestBody.set(data);
            else this.loadedResponseBody.set(data);
        } catch (err) {
            console.error(`Failed to load ${type} payload:`, err);
            if (type === 'request') this.loadedRequestBody.set(`[Error loading request body: ${err}]`);
            else this.loadedResponseBody.set(`[Error loading response body: ${err}]`);
        } finally {
            this.isLoadingPayload.set(false);
        }
    }

    async triggerDecompression() {
        const req = this.request();
        const bodyData = this.loadedResponseBody();
        const encoding = req.responseHeaders?.['content-encoding'] || req.responseHeaders?.['Content-Encoding'];

        if (!bodyData || !encoding || !isSupportedEncoding(encoding)) {
            this.decodedBody.set(null);
            return;
        }

        this.isDecoding.set(true);

        this.worker ??= new Worker(new URL('./util/decompression.worker.ts', import.meta.url), { type: 'module' });

        this.worker.onmessage = ({ data }) => {
            if (data.error) {
                console.error('Worker decompression failed:', data.error);
                this.decodedBody.set(`[Decompression Error: ${data.error}]`);
            } else {
                this.decodedBody.set(data.result);
            }
            this.isDecoding.set(false);
        };

        this.worker.onerror = (err) => {
            console.error('Worker error:', err);
            this.decodedBody.set(`[Worker Error]`);
            this.isDecoding.set(false);
        };

        this.worker.postMessage({ bodyData, encoding });
    }

    formatBytes(b: number) { return formatBytes(b); }
    formatDuration(ms: number) { return formatDurationPretty(ms); }
    formatTimestamp(ms: number) { return new Date(ms).toLocaleTimeString(); }

    /** Open file in VS Code (same pattern as AppRegistryTreeComponent) */
    getIdeLink(absolutePath: string, line?: number): string {
        if (!absolutePath) return '';
        return `vscode://file${absolutePath}${line ? ':' + line : ''}`;
    }

    openIdeLink(absolutePath: string, line?: number) {
        window.open(this.getIdeLink(absolutePath, line));
    }

    /**
     * Parse the call stack into structured lines with file path info.
     * Returns array of parsed stack frames for rendering with clickable links.
     */
    parsedCallStack = computed((): ({ type: 'stack'; prefix: string; functionName?: string; parenOpen: string; filePath: string; fileName: string; line: number; column: number; parenClose: string; raw: string } | { type: 'text'; content: string; raw: string })[] => {
        const callStack = this.request().callStack;
        if (!callStack) return [];

        const lines = callStack.split('\n');
        return lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed) return null;

            // Match stack trace lines: "    at functionName (path:line:col)" or "    at path:line:col"
            // Also handles: "    at functionName path:line:col" (no parens)
            const match = trimmed.match(/^(\s*at\s+)(\S+\s+)?(\()?(.+?):(\d+):(\d+)(\))?$/);
            if (match) {
                const [, prefix, funcName, parenOpen, filePath, lineNum, colNum, parenClose] = match;
                // Extract just the filename from the full path
                const fileName = filePath.split('/').pop() || filePath;
                // Clean up function name (remove trailing space if present)
                const functionName = funcName?.trim();
                return {
                    type: 'stack' as const,
                    prefix: prefix,
                    functionName: functionName,
                    parenOpen: parenOpen || '',
                    filePath,
                    fileName,
                    line: parseInt(lineNum, 10),
                    column: parseInt(colNum, 10),
                    parenClose: parenClose || '',
                    raw: trimmed
                };
            }

            // Match lines without file paths (Error lines, etc.)
            return {
                type: 'text' as const,
                content: trimmed,
                raw: trimmed
            };
        }).filter((item): item is NonNullable<typeof item> => item !== null);
    });

    /**
     * For each entry in handlerStack, compute the shortest path suffix that
     * uniquely identifies the file among all stack entries.
     * Returns a Map<file, displayLabel>.
     */
    readonly shortestUniquePaths = computed(() => {
        const stack = this.request().handlerStack ?? [];
        const files = stack.map((m: any) => (m.file || '') as string);
        const result = new Map<string, string>();

        files.forEach(file => {
            if (!file) { result.set(file, file); return; }
            const parts = file.split('/');

            // Find the minimum number of trailing segments that makes this path unique
            for (let depth = 1; depth <= parts.length; depth++) {
                const label = parts.slice(-depth).join('/');
                const clash = files.some(f => f !== file && f.split('/').slice(-depth).join('/') === label);
                if (!clash) {
                    result.set(file, label);
                    return;
                }
            }
            result.set(file, file); // full path as last resort
        });

        return result;
    });

    copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
    }

    /**
     * Get the reference URL for the current request's status code
     */
    getStatusCodeRefUrl(statusCode: number): string {
        return getStatusCodeUrl(statusCode);
    }

    /**
     * Get the reference URL for a given header name
     * Returns null if the header is not documented
     */
    getHeaderRefUrl(headerName: string): string | null {
        return getHeaderUrl(headerName);
    }

    /**
     * Check if a header is documented on ref.shokupan.dev
     */
    headerHasRefLink(headerName: string): boolean {
        return isHeaderDocumented(headerName);
    }

    downloadResponse() {
        const req = this.request();
        const decoded = this.decodedBody();
        const body = this.loadedResponseBody() || req.responseBody;
        const content = decoded || (typeof body === 'object' ? JSON.stringify(body, null, 2) : String(body || ''));
        const blob = new Blob([content], { type: decoded ? 'text/plain' : (req.contentType || 'text/plain') });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `response-${req.id}${decoded ? '.txt' : ''}`;
        a.click();
        URL.revokeObjectURL(url);
    }

    exportHAR() {
        const har = generateHAR([this.request()]);
        const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `request-${this.request().id}.har`;
        a.click();
        URL.revokeObjectURL(url);
    }

    copyAsCurl() {
        const req = { ...this.request(), requestBody: this.loadedRequestBody() || this.request().requestBody };
        this.copyToClipboard(generateCurlCode(req as any));
    }

    copyAsFetch() {
        const req = { ...this.request(), requestBody: this.loadedRequestBody() || this.request().requestBody };
        this.copyToClipboard(generateFetchCode(req as any));
    }
}
