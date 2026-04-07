import { CommonModule } from '@angular/common';
import { Component, computed, input, model, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AngularSplitModule } from 'angular-split';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { MenuItem } from 'primeng/api';
import { ContextMenu } from 'primeng/contextmenu';
import { generateCurlCode, generateFetchCode, generateHAR, NetworkRequest } from './network-utils';
import { ReplayModalComponent } from './replay-modal.component';
import { RequestDetailsComponent } from './request-details.component';
import { RequestListComponent } from './request-list.component';

@Component({
    selector: 'skp-network-tools',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        AngularSplitModule,
        NgScrollbarModule,
        RequestListComponent,
        RequestDetailsComponent,
        ReplayModalComponent,
        ContextMenu
    ],
    templateUrl: './network-tools.component.html',
    styleUrl: './network-tools.component.scss'
})
export class NetworkToolsComponent {
    requests = input<NetworkRequest[]>([]);
    selectedId = model<string | null>(null);
    onClear = output<void>();

    // Get reference to request list to access its filter signals
    requestList = viewChild.required<RequestListComponent>('requestList');

    readonly selectedRequest = computed(() => {
        const id = this.selectedId();
        return this.requests().find(r => r.id === id) || null;
    });
    readonly replayRequest = signal<NetworkRequest | null>(null);
    readonly showReplayModal = signal(false);

    readonly menuItems: MenuItem[] = [
        {
            label: 'Replay Request',
            icon: 'pi pi-refresh',
            command: () => this.openReplay(this.contextRequest!)
        },
        { separator: true },
        {
            label: 'Copy as cURL',
            icon: 'pi pi-copy',
            command: () => this.copyToClipboard(generateCurlCode(this.contextRequest!))
        },
        {
            label: 'Copy as Fetch',
            icon: 'pi pi-copy',
            command: () => this.copyToClipboard(generateFetchCode(this.contextRequest!))
        },
        { separator: true },
        {
            label: 'Export as HAR',
            icon: 'pi pi-download',
            command: () => this.exportHAR(this.contextRequest!)
        }
    ];

    private contextRequest: NetworkRequest | null = null;

    selectRequest(req: NetworkRequest | null) {
        console.log("NetworkToolsComponent: selecting request", req);
        this.selectedId.set(req?.id || null);
    }

    openReplay(req: NetworkRequest) {
        this.replayRequest.set(req);
        this.showReplayModal.set(true);
    }

    clear() {
        this.onClear.emit();
        this.selectedId.set(null);
    }

    togglePluginFilter() {
        const list = this.requestList();
        list.excludePluginRequests.set(!list.excludePluginRequests());
    }

    toggleStaticFilter() {
        const list = this.requestList();
        list.excludeStaticAssets.set(!list.excludeStaticAssets());
    }

    toggleProxiedFilter() {
        const list = this.requestList();
        list.excludeProxiedRequests.set(!list.excludeProxiedRequests());
    }

    setDirectionFilter(direction: 'all' | 'inbound' | 'outbound') {
        const list = this.requestList();
        list.directionFilter.set(direction);
    }

    get directionFilter() {
        return this.requestList()?.directionFilter() ?? 'all';
    }

    get excludePlugins() {
        return this.requestList()?.excludePluginRequests() ?? false;
    }

    get excludeStatic() {
        return this.requestList()?.excludeStaticAssets() ?? false;
    }

    get excludeProxied() {
        return this.requestList()?.excludeProxiedRequests() ?? false;
    }

    private copyToClipboard(text: string) {
        navigator.clipboard.writeText(text);
    }

    private exportHAR(req: NetworkRequest) {
        const har = generateHAR([req]);
        const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `request-${req.id}.har`;
        a.click();
        URL.revokeObjectURL(url);
    }

    onRowContextMenu(event: any) {
        this.contextRequest = event.data;
    }
}
