import { CommonModule, KeyValuePipe } from '@angular/common';
import { Component, input, output, signal } from '@angular/core';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { ButtonModule } from 'primeng/button';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { TooltipModule } from 'primeng/tooltip';
import { NetworkRequest, formatBytes, formatDurationPretty, generateCurlCode, generateFetchCode, generateHAR } from './network-utils';

@Component({
    selector: 'skp-request-details',
    standalone: true,
    imports: [CommonModule, Tabs, TabList, Tab, TabPanels, TabPanel, ButtonModule, TooltipModule, KeyValuePipe, NgScrollbarModule],
    templateUrl: './request-details.component.html',
    styleUrl: './request-details.component.scss'
})
export class RequestDetailsComponent {
    request = input.required<NetworkRequest>();
    onClose = output<void>();

    readonly activeTab = signal<string | number>('headers');

    formatBytes(b: number) { return formatBytes(b); }
    formatDuration(ms: number) { return formatDurationPretty(ms); }

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
