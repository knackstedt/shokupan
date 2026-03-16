import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, effect, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MonacoEditorComponent } from '@dotglitch/ngx-common/monaco-editor';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Tab, TabList, TabPanel, TabPanels, Tabs } from 'primeng/tabs';
import { ToastModule } from 'primeng/toast';

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
  imports: [
    NgScrollbarModule,
    CommonModule,
    MonacoEditorComponent,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    InputTextModule,
    ButtonModule,
      ToastModule
  ],
  templateUrl: './api-explorer.component.html',
  styleUrl: './api-explorer.component.scss',
})
export class ApiExplorerComponent implements OnInit {
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  private messageService = inject(MessageService);

  constructor() {
    // Update URL hash when endpoint is selected
    effect(() => {
      const opId = this.selectedOp();
      if (opId) {
        const currentHash = window.location.hash.slice(1);
        const tabPart = currentHash.split('/')[0] || 'api-explorer';
        window.location.hash = `${tabPart}/${opId}`;
      }
    });
  }

  readonly spec = signal<any>(null);
  readonly hierarchicalGroups = signal<GroupNode[]>([]);
  readonly expandedGroups = signal<Set<string>>(new Set());
  readonly expandedSubgroups = signal<Set<string>>(new Set());
  readonly selectedOp = signal<string | null>(null);
  readonly activeRoute = signal<Route | null>(null);
  readonly sidebarCollapsed = signal<boolean>(false);
  readonly Math = Math;

  // Request/Response state
  readonly requestUrl = signal<string>('');
  readonly requestMethod = signal<string>('GET');
  readonly requestHeaders = signal<Record<string, string>>({});
  readonly requestBody = signal<string>('');
  readonly pathParams = signal<Record<string, string>>({});
  readonly queryParams = signal<Record<string, string>>({});
  readonly responseData = signal<any>(null);
  readonly responseStatus = signal<number | null>(null);
  readonly responseHeaders = signal<Record<string, string>>({});
  readonly isLoading = signal<boolean>(false);
  readonly activeTab = signal<'info' | 'params' | 'headers' | 'payload' | 'auth' | 'response'>('info');
  readonly authHeaders = signal<Record<string, string>>({});

  @ViewChild('mainContent') mainContent?: ElementRef<HTMLElement>;

  ngOnInit(): void {
    this.loadOpenApiSpec().then(() => {
      // Restore endpoint from URL hash after spec is loaded
      const hash = window.location.hash.slice(1);
      const parts = hash.split('/');
      if (parts.length > 1) {
        const opId = parts[1];
        // Find and select the route with this operationId
        const allRoutes = this.flattenRoutes();
        const route = allRoutes.find(r => r.op.operationId === opId);
        if (route) {
          this.selectRoute(route);
        }
      }
    });
  }

  private flattenRoutes(): Route[] {
    const routes: Route[] = [];
    const traverse = (node: GroupNode) => {
      if (node.routes) {
        routes.push(...node.routes);
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    this.hierarchicalGroups().forEach(traverse);
    return routes;
  }

  private async loadOpenApiSpec(): Promise<void> {
    this.isLoading.set(true);
    this.activeTab.set('response');

    const startTime = Date.now();

    this.loadCSS('/api-explorer/style.css');
    this.loadCSS('/api-explorer/theme.css');

    return new Promise((resolve, reject) => {
      this.http.get<any>('/openapi/openapi.json').subscribe({
        next: (spec) => {
          this.spec.set(spec);
          const groups = this.buildHierarchicalGroups(spec);
          this.hierarchicalGroups.set(groups);

          // Expand first group by default
          if (groups.length > 0) {
            this.expandedGroups.update(set => {
              const next = new Set(set);
              next.add(groups[0].name);
              return next;
            });
          }
          this.isLoading.set(false);
          resolve();
        },
        error: (err) => {
          this.isLoading.set(false);
          reject(err);
        },
      });
    });
  }

  toggleGroup(name: string): void {
    this.expandedGroups.update(set => {
      const next = new Set(set);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  toggleSubgroup(name: string): void {
    this.expandedSubgroups.update(set => {
      const next = new Set(set);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  isGroupExpanded(name: string): boolean {
    return this.expandedGroups().has(name);
  }

  isSubgroupExpanded(name: string): boolean {
    return this.expandedSubgroups().has(name);
  }

  selectRoute(route: Route): void {
    this.activeRoute.set(route);
    this.selectedOp.set(route.op.operationId);
    this.requestMethod.set(route.method.toUpperCase());
    this.requestUrl.set(route.path);

    // Reset request/response state
    this.requestBody.set('');
    this.responseData.set(null);
    this.responseStatus.set(null);
    this.responseHeaders.set({});
    this.pathParams.set({});
    this.queryParams.set({});
    this.requestHeaders.set({ 'Content-Type': 'application/json' });
    this.authHeaders.set({});
    this.activeTab.set('info');

    // Extract path parameters
    const pathParamMatches = route.path.match(/\{([^}]+)\}/g);
    if (pathParamMatches) {
      const params: Record<string, string> = {};
      pathParamMatches.forEach(match => {
        const paramName = match.slice(1, -1);
        params[paramName] = '';
      });
      this.pathParams.set(params);
    }

    // Extract query parameters from OpenAPI spec
    if (route.op.parameters) {
      const queryParamsFromSpec: Record<string, string> = {};
      route.op.parameters.forEach((param: any) => {
        if (param.in === 'query') {
          queryParamsFromSpec[param.name] = '';
        }
      });
      if (Object.keys(queryParamsFromSpec).length > 0) {
        this.queryParams.set(queryParamsFromSpec);
      }
    }

    // Note: URL hash update is handled by effect() in constructor
  }

  /**
   * Sanitize route description for safe display.
   * We use Angular DomSanitizer to mark trusted HTML only after sanitising
   * via the browser's own parser (the sanitizer strips dangerous attributes).
   */
  safeDescription(html: string): SafeHtml {
    return this.sanitizer.sanitize(1 /* SecurityContext.HTML */, html) ?? '';
  }

  async executeRequest(): Promise<void> {
    this.isLoading.set(true);
    this.activeTab.set('response');

    const startTime = Date.now();

    try {
      let url = this.buildFullUrl(false);

      // Replace path parameters
      const pathParams = this.pathParams();
      Object.entries(pathParams).forEach(([key, value]) => {
        url = url.replace(`{${key}}`, encodeURIComponent(value));
      });

      // Build headers
      const headers = new HttpHeaders({
        ...this.requestHeaders(),
        ...this.authHeaders()
      });

      // Execute request
      const method = this.requestMethod().toLowerCase();
      const body = this.requestBody() ? JSON.parse(this.requestBody()) : undefined;

      const response = await this.http.request(method, url, {
        headers,
        body,
        observe: 'response',
        responseType: 'text'
      }).toPromise();

      const duration = Date.now() - startTime;

      this.responseStatus.set(response?.status || 200);
      this.responseHeaders.set(this.extractHeaders(response?.headers));
      this.responseData.set({
        body: response?.body ? JSON.parse(response.body) : null,
        duration,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.responseStatus.set(error.status || 500);
      this.responseHeaders.set(this.extractHeaders(error.headers));
      this.responseData.set({
        error: error.message || 'Request failed',
        duration,
        timestamp: new Date().toISOString()
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  private extractHeaders(headers: any): Record<string, string> {
    const result: Record<string, string> = {};
    if (headers) {
      headers.keys().forEach((key: string) => {
        result[key] = headers.get(key);
      });
    }
    return result;
  }

  updatePathParam(key: string, value: string): void {
    this.pathParams.update(params => ({ ...params, [key]: value }));
  }

  updateQueryParam(key: string, value: string): void {
    this.queryParams.update(params => ({ ...params, [key]: value }));
  }

  updateHeader(key: string, value: string): void {
    this.requestHeaders.update(headers => ({ ...headers, [key]: value }));
  }

  updateAuthHeader(key: string, value: string): void {
    this.authHeaders.update(headers => ({ ...headers, [key]: value }));
  }

  getObjectKeys(obj: any): string[] {
    return Object.keys(obj || {});
  }

  buildFullUrl(includeOrigin: boolean = false): string {
    let url = this.requestUrl();

    // Replace path parameters
    const pathParams = this.pathParams();
    Object.entries(pathParams).forEach(([key, value]) => {
      url = url.replace(`{${key}}`, encodeURIComponent(value));
    });

    // Add query parameters
    const queryParams = this.queryParams();
    const queryString = Object.entries(queryParams)
      .filter(([_, value]) => value !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }

    // Add origin if requested
    if (includeOrigin) {
      const origin = window.location.origin;
      url = origin + url;
    }

    return url;
  }

  generateCurl(): string {
    const url = this.buildFullUrl(true);
    const method = this.requestMethod();
    const headers = { ...this.requestHeaders(), ...this.authHeaders() };
    const body = this.requestBody();

    let curl = `curl -X ${method} '${url}'`;

    Object.entries(headers).forEach(([key, value]) => {
      if (value) curl += ` \\\n  -H '${key}: ${value}'`;
    });

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      curl += ` \\\n  -d '${body.replace(/'/g, "\\'")}'`;
    }

    return curl;
  }

  generateWget(): string {
    const url = this.buildFullUrl(true);
    const method = this.requestMethod();
    const headers = { ...this.requestHeaders(), ...this.authHeaders() };
    const body = this.requestBody();

    let wget = `wget --method=${method}`;

    Object.entries(headers).forEach(([key, value]) => {
      if (value) wget += ` \\\n  --header='${key}: ${value}'`;
    });

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      wget += ` \\\n  --body-data='${body.replace(/'/g, "\\'")}'`;
    }

    wget += ` \\\n  '${url}'`;

    return wget;
  }

  generateFetch(): string {
    const url = this.buildFullUrl(true);
    const method = this.requestMethod();
    const headers = { ...this.requestHeaders(), ...this.authHeaders() };
    const body = this.requestBody();

    let fetch = `fetch('${url}', {\n  method: '${method}'`;

    if (Object.keys(headers).length > 0) {
      fetch += ',\n  headers: {\n';
      Object.entries(headers).forEach(([key, value], i, arr) => {
        if (value) {
          fetch += `    '${key}': '${value}'`;
          if (i < arr.length - 1) fetch += ',';
          fetch += '\n';
        }
      });
      fetch += '  }';
    }

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetch += `,\n  body: '${body.replace(/'/g, "\\'")}'`;
    }

    fetch += '\n})';

    return fetch;
  }

  async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      console.log('Copied to clipboard:', text);
      this.messageService.add({
        severity: 'success',
        summary: 'Copied',
        detail: 'Code copied to clipboard',
        life: 1000,
        closable: false
      });
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  stripPrefix(path: string, prefix: string): string {
    if (!prefix || prefix === '/') return path;
    if (path.startsWith(prefix)) {
      const stripped = path.substring(prefix.length);
      return stripped || '/';
    }
    return path;
  }

  generateEditorLink(file: string, line: number): string {
    return `vscode://file${file}:${line}`;
  }

  renderResponseSchema(schema: any, depth: number = 0): SafeHtml {
    const html = this.renderSchemaToString(schema, depth);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private renderSchemaToString(schema: any, depth: number = 0): string {
    if (!schema) return '';

    const indent = depth * 16;
    const type = schema.type || 'any';
    const required = schema.required || [];

    // Handle oneOf
    if (schema.oneOf) {
      return `
        <div style="margin-left: ${indent}px;">
          <div style="font-weight: 500; color: var(--text-primary); margin-bottom: 8px;">
            <span style="color: var(--text-secondary); font-size: 0.85rem;">One of:</span>
          </div>
          ${schema.oneOf.map((subSchema: any, idx: number) => `
            <div style="border-left: 3px solid #4caf50; padding-left: 12px; margin-bottom: 12px;">
              <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px;">Option ${idx + 1}:</div>
              ${this.renderSchemaToString(subSchema, 0)}
            </div>
          `).join('')}
        </div>
      `;
    }

    if (type === 'object' && schema.properties) {
      const props = Object.entries(schema.properties).map(([key, prop]: [string, any]) => {
        const isRequired = required.includes(key);
        const propType = prop.type || 'any';
        const hasNested = (prop.type === 'object' && prop.properties) || (prop.type === 'array' && prop.items);

        const badgeHtml = !isRequired
          ? '<span style="margin-left: auto; font-size: 0.75rem; color: #9e9e9e; font-style: italic;">optional</span>'
          : '';

        return `
          <div style="margin-left: ${indent}px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; padding: 4px 0;">
              <code style="font-weight: 500; color: var(--text-primary);">${this.escapeHtml(key)}</code>
              <span style="color: var(--text-secondary); font-size: 0.85rem;">${this.escapeHtml(propType)}</span>
              ${badgeHtml}
            </div>
            ${prop.description ? `<div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: -4px; margin-bottom: 4px;">${this.escapeHtml(prop.description)}</div>` : ''}
            ${hasNested ? this.renderSchemaToString(propType === 'array' ? prop.items : prop, depth + 1) : ''}
          </div>
        `;
      }).join('');
      return props;
    } else if (type === 'array' && schema.items) {
      return `
        <div style="margin-left: ${indent}px; margin-top: 4px;">
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px;">
            [array items]
          </div>
          ${this.renderSchemaToString(schema.items, depth + 1)}
        </div>
      `;
    }

    return `
      <div style="margin-left: ${indent}px; padding: 4px 0;">
        <span style="color: var(--text-secondary); font-family: monospace;">${this.escapeHtml(type)}</span>
        ${schema.format ? `<span style="color: var(--text-secondary); font-size: 0.85rem; margin-left: 6px;">(${this.escapeHtml(schema.format)})</span>` : ''}
        ${schema.description ? `<div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 4px;">${this.escapeHtml(schema.description)}</div>` : ''}
      </div>
    `;
  }

  private escapeHtml(text: string): string {
    if (!text) return '';
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private loadCSS(href: string): void {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  private buildHierarchicalGroups(spec: any): GroupNode[] {
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
