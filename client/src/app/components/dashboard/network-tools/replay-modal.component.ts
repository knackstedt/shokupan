import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { NetworkRequest, formatBytes } from './network-utils';

@Component({
    selector: 'skp-replay-modal',
    standalone: true,
    imports: [CommonModule, FormsModule, Dialog, ButtonModule, InputTextModule, Select, Tabs, TabList, Tab, TabPanels, TabPanel],
    templateUrl: './replay-modal.component.html',
    styleUrl: './replay-modal.component.scss'
})
export class ReplayModalComponent {
    private http = inject(HttpClient);

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
}
