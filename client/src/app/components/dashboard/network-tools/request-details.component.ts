import { CommonModule, KeyValuePipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { MonacoEditorComponent } from '@dotglitch/ngx-common/monaco-editor';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { ButtonModule } from 'primeng/button';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { TooltipModule } from 'primeng/tooltip';
import { HeaderTokensPipe } from './header-tokens.pipe';
import { NetworkRequest, formatBytes, formatDurationPretty, generateCurlCode, generateFetchCode, generateHAR } from './network-utils';

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
    styleUrl: './request-details.component.scss'
})
export class RequestDetailsComponent {
    request = input.required<NetworkRequest>();
    onClose = output<void>();

    readonly activeTab = signal<string | number>('headers');

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
        if (typeof body === 'string') {
            try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
        }
        return JSON.stringify(body, null, 2);
    }

    /** Detect language for Monaco from the content-type or body shape */
    bodyLanguage(body: any, contentType?: string): string {
        const ct = (contentType || '').toLowerCase();
        if (ct.includes('json') || (typeof body === 'object' && body !== null)) return 'json';
        if (ct.includes('html') || (typeof body === 'string' && body.trimStart().startsWith('<'))) return 'html';
        if (ct.includes('xml')) return 'xml';
        if (ct.includes('css')) return 'css';
        if (ct.includes('javascript') || ct.includes('js')) return 'javascript';
        return 'plaintext';
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

    downloadResponse() {
        const req = this.request();
        const content = typeof req.responseBody === 'object' ? JSON.stringify(req.responseBody, null, 2) : String(req.responseBody || '');
        const blob = new Blob([content], { type: req.contentType || 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `response-${req.id}.txt`;
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
        this.copyToClipboard(generateCurlCode(this.request()));
    }

    copyAsFetch() {
        this.copyToClipboard(generateFetchCode(this.request()));
    }
}
