import { JsonPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  inject,
  OnDestroy, OnInit, signal
} from '@angular/core';
import { AngularSplitModule } from 'angular-split';
import { NgScrollbarModule } from 'ngx-scrollbar';


interface ChannelItem {
  name: string;
  type: 'publish' | 'subscribe';
  op: any;
  tag: string;
  sourceInfo?: any;
}

@Component({
  selector: 'skp-asyncapi',
  standalone: true,
  imports: [JsonPipe, NgScrollbarModule, AngularSplitModule],
  templateUrl: './asyncapi.component.html',
  styleUrl: './asyncapi.component.scss',
})
export class AsyncApiComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);

  readonly spec = signal<any>(null);
  readonly channels = signal<ChannelItem[]>([]);
  readonly channelTags = () => [...new Set(this.channels().map(c => c.tag))];
  readonly channelsByTag = (tag: string) => this.channels().filter(c => c.tag === tag);
  readonly selectedChannel = signal<ChannelItem | null>(null);
  readonly wsConnected = signal(false);
  readonly wsLogs = signal<{ dir: 'send' | 'recv'; data: string; }[]>([]);
  readonly wsUrl = signal(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);

  private ws: WebSocket | null = null;

  ngOnInit(): void {
    this.http.get<any>('/asyncapi/json').subscribe({
      next: (spec) => { this.spec.set(spec); this.buildChannels(spec); },
      error: () => { },
    });
  }

  ngOnDestroy(): void { this.ws?.close(); }

  selectChannel(ch: ChannelItem): void { this.selectedChannel.set(ch); }

  connectWs(url: string): void {
    this.ws?.close();
    this.ws = new WebSocket(url);
    this.ws.addEventListener('open', () => this.wsConnected.set(true));
    this.ws.addEventListener('close', () => this.wsConnected.set(false));
    this.ws.addEventListener('message', (ev) => {
      this.wsLogs.update(l => [...l, { dir: 'recv' as const, data: this.tryFormat(ev.data) }].slice(-200));
    });
  }

  disconnectWs(): void { this.ws?.close(); }

  sendMessage(msg: string): void {
    if (!this.wsConnected() || !this.ws) return;
    this.ws.send(msg);
    this.wsLogs.update(l => [...l, { dir: 'send' as const, data: this.tryFormat(msg) }].slice(-200));
  }

  private tryFormat(s: string): string {
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
  }

  private buildChannels(spec: any): void {
    const channels: ChannelItem[] = [];
    Object.entries(spec.channels ?? {}).forEach(([name, ch]: [string, any]) => {
      const op = ch.publish ?? ch.subscribe;
      if (!op) return;
      channels.push({
        name,
        type: ch.publish ? 'publish' : 'subscribe',
        op,
        tag: op.tags?.[0]?.name ?? 'General',
        sourceInfo: op['x-source-info'],
      });
    });
    this.channels.set(channels);
  }
}
