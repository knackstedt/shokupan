import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

interface ParsedUrl {
    scheme: string;
    domain: string;
    port?: string;
    path: string;
    query: string;
    hash: string;
}

@Component({
    selector: 'skp-url-highlight',
    standalone: true,
    imports: [CommonModule],
    template: `
        @if (parsedUrl(); as url) {
            <span class="url-highlight">
                <!-- Scheme -->
                @if (url.scheme) {
                    <span class="url-scheme">{{ url.scheme }}://</span>
                }
                <!-- Domain -->
                <span class="url-domain">{{ url.domain }}</span>
                <!-- Port -->
                @if (url.port) {
                    <span class="url-port">:{{ url.port }}</span>
                }
                <!-- Path -->
                @if (url.path) {
                    <span class="url-path">{{ url.path }}</span>
                }
                <!-- Query -->
                @if (url.query) {
                    <span class="url-query">?{{ url.query }}</span>
                }
                <!-- Hash -->
                @if (url.hash) {
                    <span class="url-hash">#{{ url.hash }}</span>
                }
            </span>
        }
    `,
    styles: [`
        :host {
            display: inline;
        }
        .url-highlight {
            font-family: var(--font-mono, monospace);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: block;
        }
        .url-scheme {
            color: var(--syntax-scheme, #6b7280);
        }
        .url-domain {
            color: var(--syntax-domain, #51d9ff);
            font-weight: 500;
        }
        .url-port {
            color: var(--syntax-port, #f59e0b);
        }
        .url-path {
            color: var(--syntax-path, #10b981);
        }
        .url-query {
            color: var(--syntax-query, #f79055);
        }
        .url-hash {
            color: var(--syntax-hash, #48ec5b);
        }
    `]
})
export class UrlHighlightComponent {
    url = input.required<string>();

    parsedUrl() {
        const url = this.url();
        if (!url) return null;

        try {
            const parsed = new URL(url);
            return {
                scheme: parsed.protocol.replace(':', ''),
                domain: parsed.hostname,
                port: parsed.port || undefined,
                path: parsed.pathname,
                query: parsed.search.replace('?', ''),
                hash: parsed.hash.replace('#', '')
            };
        } catch {
            // Fallback for invalid URLs - try to parse manually
            return this.parseUrlFallback(url);
        }
    }

    private parseUrlFallback(url: string): ParsedUrl {
        // Handle relative URLs or malformed URLs
        const schemeMatch = url.match(/^([a-z][a-z0-9+.-]*):\/\//i);
        const scheme = schemeMatch ? schemeMatch[1] : '';
        const withoutScheme = schemeMatch ? url.slice(schemeMatch[0].length) : url;

        const hashIndex = withoutScheme.indexOf('#');
        const hash = hashIndex >= 0 ? withoutScheme.slice(hashIndex + 1) : '';
        const withoutHash = hashIndex >= 0 ? withoutScheme.slice(0, hashIndex) : withoutScheme;

        const queryIndex = withoutHash.indexOf('?');
        const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';
        const withoutQuery = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

        // Extract domain and path
        const pathIndex = withoutQuery.indexOf('/');
        const domainAndPort = pathIndex >= 0 ? withoutQuery.slice(0, pathIndex) : withoutQuery;
        const path = pathIndex >= 0 ? withoutQuery.slice(pathIndex) : '/';

        // Extract port from domain
        const portMatch = domainAndPort.match(/:(\d+)$/);
        const port = portMatch ? portMatch[1] : undefined;
        const domain = portMatch ? domainAndPort.slice(0, -portMatch[0].length) : domainAndPort;

        return {
            scheme,
            domain: domain || '-',
            port,
            path: path === '' ? '/' : path,
            query,
            hash
        };
    }
}
