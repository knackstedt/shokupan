import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal, viewChild } from '@angular/core';
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
    directionFilter = signal<'all' | 'inbound' | 'outbound'>('all');
    excludePluginRequests = signal(false);
    excludeStaticAssets = signal(false);
    excludeProxiedRequests = signal(false);

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

    // Default column widths
    private readonly DEFAULT_WIDTHS: Record<string, number> = {
        status: 100,
        method: 90,
        name: 150,
        domain: 120,
        path: 200,
        url: 250,
        protocol: 80,
        scheme: 80,
        remoteIP: 110,
        initiator: 90,
        type: 80,
        cookies: 80,
        transferred: 100,
        size: 100,
        duration: 90,
        caller: 200,
        waterfall: 300
    };

    // Storage key for column settings
    private readonly COLUMN_STORAGE_KEY = 'shokupan-request-list-columns';

    // Cache loaded settings to avoid multiple reads
    private _cachedSettings: { visible: string[]; widths: Record<string, number> } | null | undefined = undefined;

    // Default visible column fields (matching old dashboard defaults)
    selectedCols = signal<string[]>(
        this.loadColumnVisibility()
    );

    // Column widths signal - loaded from localStorage or defaults
    colWidths = signal<Record<string, number>>(this.loadColumnWidths());

    constructor() {
        // Effect to save column visibility and width changes to localStorage
        // Skip the initial run to avoid overwriting loaded settings
        let isFirstRun = true;
        effect(() => {
            const visibleCols = this.selectedCols();
            const widths = this.colWidths();

            if (isFirstRun) {
                isFirstRun = false;
                return;
            }

            this.saveColumnSettings(visibleCols, widths);
        });
    }

    /**
     * Get width for a specific column - memoized for performance
     */
    private colWidthCache = new Map<string, number>();
    getColWidth = (field: string): number => {
        const widths = this.colWidths();
        const cacheKey = `${field}-${widths[field]}`;
        if (!this.colWidthCache.has(cacheKey)) {
            this.colWidthCache.clear(); // Clear cache when widths change
            this.colWidthCache.set(cacheKey, widths[field] ?? this.DEFAULT_WIDTHS[field] ?? 100);
        }
        return this.colWidthCache.get(cacheKey)!;
    };

    /**
     * Load column settings from localStorage
     * Falls back gracefully if localStorage is unavailable (private browsing, quota exceeded)
     */
    private loadColumnSettings(): { visible: string[]; widths: Record<string, number> } | null {
        // Return cached value if already loaded
        if (this._cachedSettings !== undefined) {
            return this._cachedSettings;
        }

        try {
            const stored = localStorage.getItem(this.COLUMN_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                this._cachedSettings = parsed;
                return parsed;
            }
        } catch (e) {
            // localStorage unavailable or quota exceeded - use defaults
            this._cachedSettings = null;
        }
        this._cachedSettings = null;
        return null;
    }

    /**
     * Load column visibility from localStorage
     */
    private loadColumnVisibility(): string[] {
        const settings = this.loadColumnSettings();
        if (settings?.visible) {
            // Validate that all stored columns exist in current col definitions
            const validCols = settings.visible.filter((field: string) =>
                this.cols.some(col => col.field === field)
            );
            if (validCols.length > 0) {
                return validCols;
            }
        }
        // Default visible columns
        return ['status', 'method', 'name', 'path', 'caller', 'type', 'size', 'duration', 'waterfall'];
    }

    /**
     * Load column widths from localStorage
     */
    private loadColumnWidths(): Record<string, number> {
        const settings = this.loadColumnSettings();
        return { ...this.DEFAULT_WIDTHS, ...(settings?.widths || {}) };
    }

    /**
     * Save column settings to localStorage
     * Silently fails if localStorage is unavailable
     */
    private saveColumnSettings(visibleCols: string[], widths: Record<string, number>): void {
        try {
            const data = {
                visible: visibleCols,
                widths: widths,
                timestamp: Date.now()
            };
            localStorage.setItem(this.COLUMN_STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            // localStorage unavailable - settings won't persist
        }
    }

    /**
     * Handle column resize event from tabulator
     */
    onColumnResized(field: string, newWidth: number): void {
        this.colWidths.update(widths => ({
            ...widths,
            [field]: newWidth
        }));
    }

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

    // Constants for filtering - defined once to avoid recreation
    private readonly PLUGIN_PATHS = ['/dashboard', '/scalar', '/openapi', '/asyncapi', '/_app', '/@vite', '/__vite'];
    private readonly STATIC_EXTENSIONS = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map', '.webp', '.avif'];

    // Waterfall range

    filteredRequests = computed(() => {
        const query = this.filterText().toLowerCase();
        const reqs = this.requests();
        const direction = this.directionFilter();
        const excludePlugins = this.excludePluginRequests();
        const excludeStatic = this.excludeStaticAssets();
        const excludeProxied = this.excludeProxiedRequests();

        // Early return if no filters active
        if (!query && direction === 'all' && !excludePlugins && !excludeStatic && !excludeProxied) {
            return reqs;
        }

        return reqs.filter(r => {
            // Filter by direction first (cheapest check)
            if (direction !== 'all' && r.direction !== direction) return false;

            // Filter out proxied/outbound requests if enabled
            if (excludeProxied && r.direction === 'outbound') return false;

            // Filter out plugin requests if enabled (includes Vite and _app)
            if (excludePlugins) {
                const path = r.path || '';
                const url = r.url;
                for (let i = 0; i < this.PLUGIN_PATHS.length; i++) {
                    if (path.startsWith(this.PLUGIN_PATHS[i]) || url.includes(this.PLUGIN_PATHS[i])) {
                        return false;
                    }
                }
            }

            // Filter out static assets if enabled
            if (excludeStatic) {
                const urlLower = r.url.toLowerCase();
                const pathLower = r.path?.toLowerCase() || '';
                for (let i = 0; i < this.STATIC_EXTENSIONS.length; i++) {
                    if (urlLower.endsWith(this.STATIC_EXTENSIONS[i]) || pathLower.endsWith(this.STATIC_EXTENSIONS[i])) {
                        return false;
                    }
                }
            }

            // Filter by search query last (most expensive)
            if (query) {
                const urlLower = r.url.toLowerCase();
                const methodLower = r.method.toLowerCase();
                const statusStr = r.status ? String(r.status) : '';

                if (!urlLower.includes(query) && !methodLower.includes(query) && !statusStr.includes(query)) {
                    return false;
                }
            }

            return true;
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

    // Memoize column visibility checks
    private colVisibilityCache = new Map<string, boolean>();
    isColVisible = (field: string): boolean => {
        const cols = this.selectedCols();
        const cacheKey = cols.join(',');
        if (this.colVisibilityCache.size === 0 || !this.colVisibilityCache.has(field)) {
            this.colVisibilityCache.clear();
            cols.forEach(col => this.colVisibilityCache.set(col, true));
        }
        return this.colVisibilityCache.has(field);
    };

    // Memoize getName to avoid repeated URL parsing
    private nameCache = new Map<string, string>();
    getName = (url: string): string => {
        if (!this.nameCache.has(url)) {
            try {
                const u = new URL(url, 'http://localhost');
                const parts = u.pathname.split('/');
                this.nameCache.set(url, parts[parts.length - 1] || u.hostname || url);
            } catch {
                this.nameCache.set(url, url);
            }
        }
        return this.nameCache.get(url)!;
    };

    // Memoize waterfall styles
    private waterfallCache = new Map<string, any>();
    private lastTimeRange: { min: number; max: number } = { min: 0, max: 0 };

    getWaterfallStyle = (req: NetworkRequest): any => {
        const { min, max } = this.timeRange();

        // Clear cache if time range changed
        if (min !== this.lastTimeRange.min || max !== this.lastTimeRange.max) {
            this.waterfallCache.clear();
            this.lastTimeRange = { min, max };
        }

        const cacheKey = `${req.id}-${req.timestamp}-${req.duration}`;
        if (!this.waterfallCache.has(cacheKey)) {
            const range = Math.max(1, max - min);
            const startPct = ((req.timestamp - min) / range) * 100;
            const widthPct = Math.max(0.5, (req.duration / range) * 100);
            const color = req.duration > 1000 ? '#ef4444' : req.duration > 500 ? '#f59e0b' : '#3b82f6';

            this.waterfallCache.set(cacheKey, {
                'left': `min(${startPct}%, calc(100% - 2px))`,
                'width': `${widthPct}%`,
                'background-color': color
            });
        }
        return this.waterfallCache.get(cacheKey);
    };

    // Memoize WebSocket waterfall data
    private wsWaterfallCache = new Map<string, any>();

    getWSWaterfallData = (req: NetworkRequest): any => {
        const { min, max } = this.timeRange();

        // Clear cache if time range changed
        if (min !== this.lastTimeRange.min || max !== this.lastTimeRange.max) {
            this.wsWaterfallCache.clear();
        }

        const messages = req.wsMessages || [];
        const cacheKey = `${req.id}-${messages.length}-${min}-${max}`;

        if (!this.wsWaterfallCache.has(cacheKey)) {
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

            this.wsWaterfallCache.set(cacheKey, {
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
            });
        }
        return this.wsWaterfallCache.get(cacheKey);
    };

    onRowSelect(args: [UIEvent, any]) {
        const [uiEvent, row] = args;
        const rowData = row?.getData?.() || row;
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

    // Memoize extractCaller to avoid repeated regex operations
    private callerCache = new Map<string, string>();
    extractCaller = (callStack: string): string => {
        if (!callStack) return '';

        if (!this.callerCache.has(callStack)) {
            const line = callStack.split('\n')[0];
            const file = line.match(/\/([^\/]+\.[tj]sx?):\d+:\d+/);
            this.callerCache.set(callStack, file ? file[1] : '');
        }
        return this.callerCache.get(callStack)!;
    };

    /**
     * Extracts the full file path, line, and column from a call stack line.
     * Returns null if no valid file path is found.
     * Memoized for performance.
     */
    private callerInfoCache = new Map<string, { displayText: string; fullPath: string; line: number; column: number } | null>();
    extractCallerInfo = (callStack: string): { displayText: string; fullPath: string; line: number; column: number } | null => {
        if (!callStack) {
            return null;
        }

        if (!this.callerInfoCache.has(callStack)) {
            const line = callStack.split('\n')[0]?.trim();

            // Match file paths with line and column numbers: /path/file.ts:123:45
            const match = line.match(/\s*at\s+(?<function>\S+?)?\s+\(?(?<filePath>.+?):(?<line>\d+):(?<column>\d+)\)?/);
            if (match) {
                const { filePath, line: lineStr, column: colStr } = match.groups as { filePath: string; line: string; column: string };

                // Extract just the filename for display
                const parts = filePath.split('/');
                const shortPath = parts.slice(-1)[0];

                this.callerInfoCache.set(callStack, {
                    displayText: shortPath || filePath,
                    fullPath: filePath,
                    line: parseInt(lineStr, 10) || 1,
                    column: parseInt(colStr, 10) || 1
                });
            } else {
                this.callerInfoCache.set(callStack, null);
            }
        }
        return this.callerInfoCache.get(callStack)!;
    };

    /**
     * Generates an IDE link (vscode://file) for opening the file at a specific line.
     * Uses the shared logic from the backend's ide.ts
     */
    getIdeLink(absolutePath: string, line?: number): string {
        return `vscode://file${absolutePath}${line ? ':' + line : ''}`;
    }
}
