import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AngularSplitModule } from 'angular-split';
import { NgScrollbarModule } from 'ngx-scrollbar';

interface SourceInfo {
  file: string;
  line: number;
  startLine?: number;
  endLine?: number;
}

interface ChannelItem {
  name: string;
  type: 'publish' | 'subscribe';
  op: any;
  tag: string;
  sourceInfo?: SourceInfo;
}

interface NavTreeNode {
  children: Record<string, NavTreeNode>;
  isLeaf?: boolean;
  data?: {
    name: string;
    op: any;
    type: 'publish' | 'subscribe';
  };
}

/** Flat leaf entry used for rendering in the sidebar. */
export interface FlatLeaf {
  /** Human-readable label (last path segment, or joined segments). */
  label: string;
  /** Full channel name (the key from spec.channels). */
  name: string;
  op: any;
  type: 'publish' | 'subscribe';
}

@Component({
  selector: 'skp-asyncapi',
  standalone: true,
  imports: [CommonModule, FormsModule, NgScrollbarModule, AngularSplitModule],
  templateUrl: './asyncapi.component.html',
  styleUrl: './asyncapi.component.scss',
})
export class AsyncApiComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);

  readonly spec = signal<any>(null);
  readonly navTree = signal<NavTreeNode>({ children: {} });
  readonly selectedChannel = signal<ChannelItem | null>(null);
  readonly wsConnected = signal<boolean>(false);
  readonly wsLogs = signal<{ dir: 'send' | 'recv'; data: string; timestamp: Date }[]>([]);
  readonly serverUrl = signal<string>(location.host);
  readonly wsProtocol = signal<string>(location.protocol === 'https:' ? 'wss' : 'ws');
  readonly targetEvent = signal<string>('--');
  readonly groupByRouter = signal<boolean>(true);
  readonly activeTab = signal<'recv' | 'send'>('recv');

  /** IDE link pattern from the server, e.g. "vscode://file/{{absolute}}:{{line}}:{{column}}" */
  private ideLinkPattern = 'vscode://file/{{absolute}}:{{line}}:{{column}}';

  private ws: WebSocket | null = null;

  ngOnInit(): void {
    this.loadSpec();
  }

  private loadSpec(): void {
    this.http.get<any>('/asyncapi/json').subscribe({
      next: (spec) => {
        // Pull out the server-computed IDE link pattern before storing the spec
        if (spec?.['x-ide-link-pattern']) {
          this.ideLinkPattern = spec['x-ide-link-pattern'];
        }

        this.spec.set(spec);
        const navTree = this.buildNavTree(spec);
        this.navTree.set(navTree);

        // Auto-connect WebSocket (will handle spec updates via messages)
        if (!this.wsConnected()) {
          setTimeout(() => this.connectWebSocket(), 100);
        }
      },
      error: (err) => {
        console.error('Failed to load AsyncAPI spec:', err);
      },
    });
  }

  ngOnDestroy(): void {
    this.ws?.close();
  }

  /**
   * Returns the first SourceInfo object from the op's x-source-info array (or the
   * object itself for backwards-compatibility if it is not an array).
   */
  getFirstSourceInfo(op: any): SourceInfo | undefined {
    const si = op?.['x-source-info'];
    if (!si) return undefined;
    return Array.isArray(si) ? si[0] as SourceInfo | undefined : si as SourceInfo;
  }

  selectChannel(channelName: string, op: any, type: 'publish' | 'subscribe'): void {
    const channel: ChannelItem = {
      name: channelName,
      type,
      op,
      tag: op.tags?.[0]?.name ?? 'General',
      sourceInfo: this.getFirstSourceInfo(op),
    };
    this.selectedChannel.set(channel);
    this.targetEvent.set(channelName);
  }

  connectWebSocket(): void {
    let url = this.serverUrl();
    const protocol = this.wsProtocol();

    this.ws?.close();

    if (protocol === 'socket.io') {
      console.warn('Socket.IO support not yet implemented');
      return;
    }

    // Strip any existing protocol prefix
    url = url.replace(/^(wss?:\/\/)?/, '');
    const wsUrl = `${protocol}://${url}/asyncapi/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.addEventListener('open', () => {
        this.wsConnected.set(true);
        this.addLog(`Connected to ${wsUrl}`, 'system');
      });

      this.ws.addEventListener('close', (event) => {
        this.wsConnected.set(false);
        this.addLog(`Disconnected (code: ${event.code})`, 'system');
      });

      this.ws.addEventListener('message', (event) => {
        this.addLog(event.data, 'recv');

        try {
          const data = JSON.parse(event.data);
          if (data.type === 'spec-updated' || data.event === 'ast-complete') {
            this.loadSpec();
          }
        } catch {
          // Non-JSON message — fine
        }
      });

      this.ws.addEventListener('error', () => {
        this.addLog(`Connection error — check console for details`, 'system');
      });
    } catch (err: any) {
      this.addLog(`Failed to connect: ${err.message}`, 'system');
    }
  }

  disconnectWebSocket(): void {
    this.ws?.close();
    this.wsConnected.set(false);
  }

  sendMessage(message: string): void {
    if (!this.wsConnected() || !this.ws) return;
    this.ws.send(message);
    this.addLog(message, 'send');
  }

  clearLogs(): void {
    this.wsLogs.set([]);
  }

  /**
   * Shortens a file path by removing workspace root and common prefixes.
   */
  shortenFilePath(file: string): string {
    if (!file) return '';

    // Remove common workspace prefixes
    let shortened = file
      .replace(/^.*\/node_modules\//, 'node_modules/')
      .replace(/^.*\/src\//, 'src/')
      .replace(/^.*\/examples\//, 'examples/')
      .replace(/^.*\/shokupan\//, '');

    // If still too long, show last 2-3 path segments
    const parts = shortened.split('/');
    if (parts.length > 3) {
      shortened = '.../' + parts.slice(-3).join('/');
    }

    return shortened;
  }

  /**
   * Generates an IDE link using the pattern provided by the server.
   * Substitutes {{absolute}} and {{line}} (and optionally {{column}}).
   */
  generateEditorLink(file: string, line: number = 1, column: number = 1): string {
    return this.ideLinkPattern
      .replace('{{absolute}}', file)
      .replace('{{relative}}', file) // fallback for web-based patterns
      .replace('{{line}}', String(line))
      .replace('{{column}}', String(column));
  }

  toggleGrouping(): void {
    this.groupByRouter.update(v => !v);
    const spec = this.spec();
    if (spec) {
      const navTree = this.buildNavTree(spec);
      this.navTree.set(navTree);
    }
  }

  setActiveTab(tab: 'recv' | 'send'): void {
    this.activeTab.set(tab);
  }

  getSendEvents(): Array<{ name: string; op: any; triggeringEvents: string[] }> {
    const spec = this.spec();
    if (!spec?.channels) return [];

    const sendEvents: Array<{ name: string; op: any; triggeringEvents: string[] }> = [];
    const emitMap = new Map<string, string[]>(); // Maps emit event -> source events

    // First pass: build map of which RECV events emit which SEND events
    Object.keys(spec.channels).forEach(channelName => {
      const ch = spec.channels[channelName];
      if (ch.publish) {
        // This is a RECV event, check what it emits
        const astMatch = ch.publish['x-shokupan-source'];
        // In the future, we'll parse emits from AST data
        // For now, we'll use the subscribe channels directly
      }
    });

    // Second pass: collect all SEND events
    Object.keys(spec.channels).forEach(channelName => {
      const ch = spec.channels[channelName];
      if (ch.subscribe) {
        sendEvents.push({
          name: channelName,
          op: ch.subscribe,
          triggeringEvents: emitMap.get(channelName) || []
        });
      }
    });

    return sendEvents;
  }

  formatChannelType(type: 'publish' | 'subscribe'): string {
    // In AsyncAPI from server perspective:
    // publish = client publishes to server = server RECEIVES
    // subscribe = client subscribes from server = server SENDS
    return type === 'publish' ? 'RECV' : 'SEND';
  }

  // ── Nav tree helpers ────────────────────────────────────────────────────

  private buildNavTree(spec: any): NavTreeNode {
    if (!spec || !spec.channels) return { children: {} };

    const root: NavTreeNode = { children: {} };
    const groupByRouter = this.groupByRouter();

    Object.keys(spec.channels).forEach(name => {
      const ch = spec.channels[name];
      const op = ch.publish || ch.subscribe;
      const type = ch.publish ? 'publish' : 'subscribe';

      if (groupByRouter) {
        // Group by router/controller (tag)
        const tag = (op.tags && op.tags.length > 0) ? op.tags[0].name : 'General';

        // Ensure Tag Group Exists
        if (!root.children[tag]) root.children[tag] = { children: {} };

        const parts = name.split(/[\.\/]/);
        let current = root.children[tag];

        parts.forEach((part, i) => {
          if (!current.children[part]) current.children[part] = { children: {} };
          current = current.children[part];

          if (i === parts.length - 1) {
            current.isLeaf = true;
            current.data = { name, op, type };
          }
        });
      } else {
        // Group by event name only (flat structure under type)
        const typeGroup = type === 'publish' ? 'Client → Server (RECV)' : 'Server → Client (SEND)';

        if (!root.children[typeGroup]) root.children[typeGroup] = { children: {} };

        const parts = name.split(/[\.\/]/);
        let current = root.children[typeGroup];

        parts.forEach((part, i) => {
          if (!current.children[part]) current.children[part] = { children: {} };
          current = current.children[part];

          if (i === parts.length - 1) {
            current.isLeaf = true;
            current.data = { name, op, type };
          }
        });
      }
    });

    return root;
  }

  /** Returns sorted top-level entries (tag groups). */
  getSortedEntries(node: NavTreeNode): [string, NavTreeNode][] {
    return Object.entries(node.children || {}).sort((a, b) => {
      const [aKey, aItem] = a;
      const [bKey, bItem] = b;

      // Prioritize Warnings
      const isWarningA = aItem.data?.op?.['x-warning'];
      const isWarningB = bItem.data?.op?.['x-warning'];
      if (isWarningA && !isWarningB) return -1;
      if (!isWarningA && isWarningB) return 1;

      if (aKey === bKey) return 0;
      if (aKey === 'Warning' || aKey === 'Warnings') return -1;
      if (bKey === 'Warning' || bKey === 'Warnings') return 1;
      if (aKey === 'Application') return -1;
      if (bKey === 'Application') return 1;

      if (aKey[0] === '/') return 1;
      if (bKey[0] === '/') return -1;

      return aKey.localeCompare(bKey);
    });
  }

  /**
   * Recursively collects all leaf nodes from a subtree, sorted in the same
   * order as the Preact NavNode component. Non-leaf intermediate nodes are
   * included as non-selectable labels (isLeaf === false, no data).
   */
  getFlatItems(node: NavTreeNode): Array<{ label: string; depth: number; isLeaf: boolean; node: NavTreeNode }> {
    const result: Array<{ label: string; depth: number; isLeaf: boolean; node: NavTreeNode }> = [];
    const walk = (n: NavTreeNode, depth: number) => {
      const sorted = this.getSortedEntries(n);
      for (const [key, child] of sorted) {
        result.push({ label: key, depth, isLeaf: !!child.isLeaf, node: child });
        if (!child.isLeaf && Object.keys(child.children || {}).length > 0) {
          walk(child, depth + 1);
        }
      }
    };
    walk(node, 0);
    return result;
  }

  hasChildren(node: NavTreeNode): boolean {
    return Object.keys(node.children || {}).length > 0;
  }

  isWarning(item: NavTreeNode): boolean {
    return item.data?.op?.['x-warning'] === true;
  }

  isPlugin(item: NavTreeNode): boolean {
    return !!(item.data?.op?.['x-shokupan-plugin-name'] || this.getFirstSourceInfo(item.data?.op)?.file);
  }

  hasChannels(): boolean {
    const spec = this.spec();
    return spec && spec.channels && Object.keys(spec.channels).length > 0;
  }

  /**
   * Get payload type description from AST data
   */
  getPayloadType(op: any): string {
    const payload = op?.message?.payload;
    if (!payload) return 'any';

    if (payload.type) {
      if (payload.type === 'object' && payload.properties) {
        const props = Object.keys(payload.properties).slice(0, 3).join(', ');
        const more = Object.keys(payload.properties).length > 3 ? ', ...' : '';
        return `{ ${props}${more} }`;
      }
      if (payload.type === 'array' && payload.items) {
        return `${payload.items.type || 'any'}[]`;
      }
      return payload.type;
    }

    if (payload.$ref) {
      return payload.$ref.split('/').pop() || 'object';
    }

    return 'object';
  }

  private addLog(data: string, direction: 'send' | 'recv' | 'system'): void {
    const formattedData = this.tryFormatJSON(data);
    this.wsLogs.update(logs => [
      ...logs,
      { dir: direction as 'send' | 'recv', data: formattedData, timestamp: new Date() }
    ].slice(-200)); // Keep last 200 logs
  }

  private tryFormatJSON(data: string): string {
    try {
      const parsed = JSON.parse(data);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return data;
    }
  }
}
