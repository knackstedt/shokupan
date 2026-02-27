import { CommonModule } from '@angular/common';
import { Component, computed, input, model, output, signal } from '@angular/core';
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
