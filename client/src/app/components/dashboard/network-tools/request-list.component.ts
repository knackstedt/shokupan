import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, model, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TabulatorModule } from 'ngx-tabulator-tables';
import { ButtonModule } from 'primeng/button';
import { ContextMenu, ContextMenuModule } from 'primeng/contextmenu';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { TooltipModule } from 'primeng/tooltip';
import { formatBytes, formatDurationPretty, NetworkRequest } from './network-utils';

@Component({
    selector: 'skp-request-list',
    standalone: true,
    imports: [TabulatorModule, InputTextModule, ButtonModule, TooltipModule, MultiSelectModule, FormsModule, ContextMenuModule, NgStyle],
    templateUrl: './request-list.component.html',
    styleUrl: './request-list.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RequestListComponent {
    requests = input<NetworkRequest[]>([]);
    selectedId = model<string | null>(null);
    contextMenu = input<any>();
    onSelect = output<NetworkRequest | null>();
    onContextMenu = output<any>();

    filterText = signal('');

    // Column configuration
    cols = [
        { field: 'status', header: 'Status', width: '100px' },
        { field: 'method', header: 'Method', width: '90px' },
        { field: 'name', header: 'Name', width: '150px' },
        { field: 'domain', header: 'Domain', width: '120px' },
        { field: 'path', header: 'Path', width: '200px' },
        { field: 'url', header: 'URL', width: '250px' },
        { field: 'protocol', header: 'Protocol', width: '80px' },
        { field: 'scheme', header: 'Scheme', width: '80px' },
        { field: 'remoteIP', header: 'Remote IP', width: '110px' },
        { field: 'initiator', header: 'Initiator', width: '90px' },
        { field: 'type', header: 'Type', width: '80px' },
        { field: 'cookies', header: 'Cookies', width: '80px' },
        { field: 'transferred', header: 'Transferred', width: '100px' },
        { field: 'size', header: 'Size', width: '100px' },
        { field: 'duration', header: 'Time', width: '90px' },
        { field: 'caller', header: 'Caller', width: '200px' },
        { field: 'waterfall', header: 'Waterfall', width: 'auto' }
    ];

    // Context menu for column headers
    colContextMenu = viewChild.required<ContextMenu>('colContextMenu');

    // Column menu items - simple text labels with unicode checkmarks
    colMenuItems = computed(() => {
        const selected = new Set(this.selectedCols());
        return this.cols.map(col => {
            const isVisible = selected.has(col.field);
            return {
                label: isVisible ? `✓ ${col.header}` : `  ${col.header}`,
                header: col.header,
                isVisible: isVisible,
                command: () => this.toggleColumn(col.field)
            };
        });
    });

    // Default visible column fields (matching old dashboard defaults)
    selectedCols = signal<string[]>(
        ['status', 'method', 'name', 'path', 'caller', 'type', 'size', 'duration', 'waterfall']
    );

    toggleColumn(field: string) {
        const current = this.selectedCols();
        const hasField = current.includes(field);
        if (hasField) {
            this.selectedCols.set(current.filter(f => f !== field));
        } else {
            this.selectedCols.set([...current, field]);
        }
    }

    onHeaderContext(args: [UIEvent, any]) {
        const [event] = args;
        event.preventDefault();
        this.colContextMenu().show(event);
    }

    // Waterfall range

    filteredRequests = computed(() => {
        const query = this.filterText().toLowerCase();
        const reqs = this.requests();

        return reqs.filter(r => {
            return !query ||
                r.url.toLowerCase().includes(query) ||
                r.method.toLowerCase().includes(query) ||
                (r.status && String(r.status).includes(query));
        });
    });

    // Helper to calculate time range for the waterfall
    timeRange = computed(() => {
        const reqs = this.filteredRequests();
        let min = Infinity;
        let max = 0;

        reqs.forEach(r => {
            if (r.timestamp < min) min = r.timestamp;
            const end = r.timestamp + (r.duration || 0);
            if (end > max) max = end;
        });

        return { min, max };
    });


    formatBytes(b: number) { return formatBytes(b); }
    formatDuration(ms: number) { return formatDurationPretty(ms); }

    stats = computed(() => {
        const filtered = this.filteredRequests();
        const total = this.requests();

        let transferred = 0;
        let resources = 0;
        let totalDuration = 0;
        let durationCount = 0;
        let failedCount = 0;
        let pendingCount = 0;
        let typeCounts = { fetch: 0, xhr: 0, ws: 0, other: 0 };

        filtered.forEach(r => {
            const type = (r.type || 'other').toLowerCase();
            if (type === 'fetch') typeCounts.fetch++;
            else if (type === 'xhr') typeCounts.xhr++;
            else if (type === 'ws') typeCounts.ws++;
            else typeCounts.other++;

            transferred += Number(r.transferred || r.size || 0);
            resources += Number(r.size || 0);

            if (!r.status) {
                pendingCount++;
            } else if (r.status >= 400) {
                failedCount++;
            }

            if (r.duration !== undefined && r.duration !== null) {
                totalDuration += r.duration;
                durationCount++;
            }
        });

        const completedCount = filtered.length - pendingCount;
        const successRate = completedCount > 0
            ? ((completedCount - failedCount) / completedCount * 100).toFixed(1)
            : '0.0';

        return {
            filteredCount: filtered.length,
            totalCount: total.length,
            transferred: formatBytes(transferred),
            resources: formatBytes(resources),
            avgLatency: durationCount > 0 ? formatDurationPretty(totalDuration / durationCount) : '0ms',
            failedCount,
            pendingCount,
            successRate,
            typeCounts
        };
    });

    isColVisible(field: string): boolean {
        return this.selectedCols().includes(field);
    }

    getName(url: string) {
        try {
            const u = new URL(url, 'http://localhost');
            const parts = u.pathname.split('/');
            return parts[parts.length - 1] || u.hostname || url;
        } catch { return url; }
    }

    getWaterfallStyle(req: NetworkRequest) {
        const { min, max } = this.timeRange();
        const range = Math.max(1, max - min);
        const startPct = ((req.timestamp - min) / range) * 100;
        const widthPct = Math.max(0.5, (req.duration / range) * 100);

        const color = req.duration > 1000 ? '#ef4444' : req.duration > 500 ? '#f59e0b' : '#3b82f6';

        return {
            'left': `min(${startPct}%, calc(100% - 2px))`,
            'width': `${widthPct}%`,
            'background-color': color
        };
    }

    getWSWaterfallData(req: NetworkRequest) {
        const { min, max } = this.timeRange();
        const messages = req.wsMessages || [];
        const range = Math.max(1, max - min);

        const openEvent = messages.find(m => m.type === 'open');
        const closeEvent = messages.find(m => m.type === 'close');

        let wsStart = req.timestamp;
        let wsEnd = req.timestamp + (req.duration || 0);
        let isOpen = !closeEvent;

        if (openEvent) wsStart = openEvent.timestamp;
        if (isOpen) wsEnd = Math.max(wsEnd, max);

        const wsStartPct = Math.max(0, ((wsStart - min) / range) * 100);
        const wsEndPct = Math.min(100, ((wsEnd - min) / range) * 100);

        return {
            lineStyle: {
                'left': `${wsStartPct}%`,
                'width': `${Math.max(0.5, wsEndPct - wsStartPct)}%`
            },
            startMarkerStyle: { 'left': `${wsStartPct}%` },
            endMarkerStyle: { 'left': `${wsEndPct}%` },
            isOpen,
            pixels: messages.filter(m => m.type === 'message').map(msg => {
                const msgPct = ((msg.timestamp - min) / range) * 100;
                const isOut = msg.dir === 'out';
                return {
                    style: {
                        'left': `${msgPct}%`,
                        'background-color': isOut ? '#10b981' : '#3b82f6',
                        [isOut ? 'bottom' : 'top']: 'calc(50% + 2px)'
                    },
                    title: `${isOut ? 'Send' : 'Recv'}: ${formatBytes(msg.size)}`
                };
            })
        };
    }

    onRowSelect(args: [UIEvent, any]) {
        const [uiEvent, row] = args;
        const rowData = row?.getData?.() || row;
        console.log("RequestListComponent: row selected", rowData);
        this.selectedId.set(rowData?.id);
        this.onSelect.emit(rowData);
    }

    onRowContext(args: [UIEvent, any]) {
        const [uiEvent, row] = args;
        if (uiEvent && row) {
            this.onContextMenu.emit({ originalEvent: uiEvent, data: row.getData() });
            this.contextMenu()?.show(uiEvent);
            uiEvent.preventDefault();
        }
    }

    debug(type: string, event: any) {
        console.log("RequestListComponent: " + type + " clicked", event);
    }

    rowFormatter = (row: any) => {
        const data = row.getData();
        if (data.status >= 400) {
            row.getElement().classList.add('row-error');
        } else {
            row.getElement().classList.remove('row-error');
        }
    };

    extractCaller(callStack: string): string {
        if (!callStack) return '';

        // Extract the first line from the call stack
        const line = callStack.split('\n')[0];
        const file = line.match(/\/([^\/]+\.[tj]sx?):\d+:\d+/);
        return file ? file[1] : '';
    }
}
