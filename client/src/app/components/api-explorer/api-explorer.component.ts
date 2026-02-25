import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NgScrollbarModule } from 'ngx-scrollbar';


interface Route {
  method: string;
  path: string;
  op: any;
}

interface GroupNode {
  name: string;
  type: 'group' | 'subgroup' | 'route';
  routes?: Route[];
  children?: GroupNode[];
  path?: string;
  isBuiltin?: boolean;
  middleware?: any[];
  commonPrefixPath?: string;
}

@Component({
  selector: 'skp-api-explorer',
  standalone: true,
  imports: [NgScrollbarModule],
  templateUrl: './api-explorer.component.html',
  styleUrl: './api-explorer.component.scss',
})
export class ApiExplorerComponent implements OnInit {
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);

  readonly spec = signal<any>(null);
  readonly groups = signal<GroupNode[]>([]);
  readonly expandedGroups = signal<Set<string>>(new Set());
  readonly selectedOp = signal<string | null>(null);
  readonly activeRoute = signal<Route | null>(null);
  readonly tryResult = signal<string | null>(null);
  readonly tryStatus = signal<number | null>(null);

  ngOnInit(): void {
    this.http.get<any>('/openapi/openapi.json').subscribe({
      next: (spec) => {
        this.spec.set(spec);
        this.groups.set(this.buildGroups(spec));
      },
      error: () => { },
    });
  }

  toggleGroup(name: string): void {
    this.expandedGroups.update(set => {
      const next = new Set(set);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  selectRoute(route: Route): void {
    this.activeRoute.set(route);
    this.selectedOp.set(route.op.operationId);
    this.tryResult.set(null);
    this.tryStatus.set(null);
  }

  sendRequest(): void {
    const r = this.activeRoute();
    if (!r) return;
    const path = r.path.replace(/\{([^}]+)\}/g, (_: string, p: string) => {
      return prompt(`Value for :${p}`) ?? `:${p}`;
    });
    this.http.request(r.method.toUpperCase(), path, { observe: 'response', responseType: 'text' })
      .subscribe({
        next: (res) => { this.tryStatus.set(res.status); this.tryResult.set(res.body ?? '(empty)'); },
        error: (err) => { this.tryStatus.set(err.status); this.tryResult.set(err.message); },
      });
  }

  /**
   * Sanitize route description for safe display.
   * We use Angular DomSanitizer to mark trusted HTML only after sanitising
   * via the browser's own parser (the sanitizer strips dangerous attributes).
   */
  safeDescription(html: string): SafeHtml {
    return this.sanitizer.sanitize(1 /* SecurityContext.HTML */, html) ?? '';
  }

  private buildGroups(spec: any): GroupNode[] {
    const hierarchy = new Map<string, Route[]>();
    Object.entries(spec.paths ?? {}).forEach(([path, methods]: [string, any]) => {
      Object.entries(methods).forEach(([method, op]: [string, any]) => {
        if (!op.operationId) op.operationId = `${method}-${path.replace(/\//g, '-')}`;
        const key = op.tags?.[0] ?? 'General';
        if (!hierarchy.has(key)) hierarchy.set(key, []);
        hierarchy.get(key)!.push({ method, path, op });
      });
    });
    return Array.from(hierarchy.entries()).map(([name, routes]) => ({
      name,
      type: 'group' as const,
      commonPrefixPath: '',
      children: routes.map(r => ({
        name: r.path,
        type: 'route' as const,
        routes: [r],
      })),
      isBuiltin: routes.some(r => r.op['x-shokupan-builtin']),
    }));
  }
}
