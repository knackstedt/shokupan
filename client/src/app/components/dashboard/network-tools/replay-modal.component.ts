import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { MonacoEditorComponent } from '@dotglitch/ngx-common/monaco-editor';
import { ButtonModule } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { NetworkRequest, formatBytes } from './network-utils';

@Component({
    selector: 'skp-replay-modal',
    standalone: true,
    imports: [CommonModule, FormsModule, Dialog, ButtonModule, InputTextModule, Select, Tabs, TabList, Tab, TabPanels, TabPanel, MonacoEditorComponent],
    templateUrl: './replay-modal.component.html',
    styleUrl: './replay-modal.component.scss'
})
export class ReplayModalComponent {
    private http = inject(HttpClient);
    private sanitizer = inject(DomSanitizer);

    request = input.required<NetworkRequest>();
    visible = input<boolean>(false);
    onClose = output<void>();

    methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    replayState = signal({
        method: 'GET',
        url: '',
        headers: [] as { key: string, value: string; }[],
        body: '',
        activeTab: 0,
        response: null as any,
        loading: false
    });

    // Initialize state when request changes
    constructor() {
        // Use an effect to sync input to state if needed, but constructor might be too early for inputs
    }

    ngOnChanges() {
        if (this.request()) {
            const req = this.request();
            this.replayState.update(s => ({
                ...s,
                method: req.method,
                url: req.url,
                headers: Object.entries(req.requestHeaders || {}).map(([key, value]) => ({ key, value })),
                body: typeof req.requestBody === 'object' ? JSON.stringify(req.requestBody, null, 2) : String(req.requestBody || ''),
                response: null
            }));
        }
    }

    addHeader() {
        this.replayState.update(s => ({
            ...s,
            headers: [...s.headers, { key: '', value: '' }]
        }));
    }

    removeHeader(index: number) {
        this.replayState.update(s => {
            const h = [...s.headers];
            h.splice(index, 1);
            return { ...s, headers: h };
        });
    }

    updateActiveTab(activeTab: any) {
        this.replayState.update(s => ({ ...s, activeTab }));
    }

    updateUrl(url: string) {
        this.replayState.update(s => ({ ...s, url }));
    }

    updateMethod(method: string) {
        this.replayState.update(s => ({ ...s, method }));
    }

    updateBody(body: string) {
        this.replayState.update(s => ({ ...s, body }));
    }

    send() {
        this.executeReplay();
    }

    executeReplay() {
        const state = this.replayState();
        const headers: Record<string, string> = {};
        state.headers.forEach(h => { if (h.key) headers[h.key] = h.value; });

        let body = state.body;
        try { body = JSON.parse(state.body); } catch { }

        this.replayState.update(s => ({ ...s, loading: true }));

        this.http.post<any>('/dashboard/replay', {
            method: state.method,
            url: state.url,
            headers,
            body,
            direction: this.request().direction
        }).subscribe({
            next: (res) => {
                this.replayState.update(s => ({
                    ...s,
                    loading: false,
                    response: res,
                    activeTab: 2 // Switch to response tab
                }));
            },
            error: (err) => {
                this.replayState.update(s => ({ ...s, loading: false }));
                alert("Replay failed: " + (err.error?.error || err.message));
            }
        });
    }

    formatBytes(b: number) { return formatBytes(b); }

    readonly responseContentType = computed(() => {
        const res = this.replayState().response;
        if (!res?.headers) return 'text/plain';
        return res.headers['content-type'] || res.headers['Content-Type'] || 'text/plain';
    });

    readonly responseDisplayType = computed(() => {
        const contentType = this.responseContentType().toLowerCase();
        const res = this.replayState().response;

        if (!res) return 'none';

        // Check for images
        if (contentType.includes('image/')) return 'image';

        // Check for PDF
        if (contentType.includes('pdf')) return 'pdf';

        // Check for text-based content
        if (contentType.includes('text/') ||
            contentType.includes('json') ||
            contentType.includes('xml') ||
            contentType.includes('javascript') ||
            contentType.includes('html')) {
            return 'text';
        }

        // Everything else is binary/download
        return 'binary';
    });

    readonly responseLanguage = computed(() => {
        const contentType = this.responseContentType().toLowerCase();
        if (contentType.includes('json')) return 'json';
        if (contentType.includes('html')) return 'html';
        if (contentType.includes('xml')) return 'xml';
        if (contentType.includes('css')) return 'css';
        if (contentType.includes('javascript') || contentType.includes('js')) return 'javascript';
        return 'plaintext';
    });

    readonly responseDataUrl = computed(() => {
        const res = this.replayState().response;
        const displayType = this.responseDisplayType();

        if (!res || (displayType !== 'image' && displayType !== 'pdf')) return null;

        const contentType = this.responseContentType();
        const data = res.data;

        // Create a data URL or blob URL
        try {
            // If data is base64, use it directly
            if (typeof data === 'string') {
                // Check if it's already a data URL
                if (data.startsWith('data:')) {
                    return this.sanitizer.bypassSecurityTrustResourceUrl(data);
                }
                // Otherwise create a data URL
                const dataUrl = `data:${contentType};base64,${btoa(data)}`;
                return this.sanitizer.bypassSecurityTrustResourceUrl(dataUrl);
            }
        } catch (e) {
            console.error('Failed to create data URL:', e);
        }

        return null;
    });

    readonly formattedResponseBody = computed(() => {
        const res = this.replayState().response;
        if (!res?.data) return '';

        const data = res.data;
        const lang = this.responseLanguage();

        // Try to pretty-print JSON
        if (lang === 'json' && typeof data === 'string') {
            try {
                const parsed = JSON.parse(data);
                return JSON.stringify(parsed, null, 2);
            } catch {
                return data;
            }
        }

        return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    });

    downloadResponse() {
        const res = this.replayState().response;
        if (!res?.data) return;

        const contentType = this.responseContentType();
        const data = res.data;
        const blob = new Blob([data], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Try to extract filename from content-disposition header or use default
        const disposition = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition'];
        let filename = 'response';
        if (disposition) {
            const match = disposition.match(/filename="?([^"]+)"?/);
            if (match) filename = match[1];
        }

        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
    }

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
}
