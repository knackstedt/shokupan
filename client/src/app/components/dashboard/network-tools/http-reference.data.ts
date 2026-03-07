/**
 * HTTP headers documented on ref.shokupan.dev
 * Used to determine which headers should show reference links in the network panel
 */
export const DOCUMENTED_HEADERS = new Set<string>([
    // Authentication & Security
    'authorization',
    'proxy-authorization',
    'www-authenticate',
    'proxy-authenticate',

    // Caching
    'cache-control',
    'etag',
    'last-modified',
    'if-match',
    'if-none-match',
    'if-modified-since',
    'if-unmodified-since',
    'if-range',
    'age',
    'expires',
    'vary',

    // Content negotiation & representation
    'accept',
    'accept-charset',
    'accept-encoding',
    'accept-language',
    'content-type',
    'content-encoding',
    'content-language',
    'content-length',
    'content-location',
    'content-range',
    'content-disposition',

    // Cookies
    'cookie',
    'set-cookie',

    // CORS
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-allow-credentials',
    'access-control-expose-headers',
    'access-control-max-age',
    'access-control-request-method',
    'access-control-request-headers',
    'origin',

    // Connection & transport
    'connection',
    'keep-alive',
    'upgrade',
    'transfer-encoding',
    'te',
    'trailer',
    'via',

    // Request context
    'host',
    'referer',
    'referrer-policy',
    'user-agent',
    'from',

    // Response context
    'location',
    'server',
    'allow',
    'date',

    // Message body info
    'expect',

    // Proxies & forwarding
    'forwarded',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-real-ip',

    // Security headers
    'strict-transport-security',
    'content-security-policy',
    'content-security-policy-report-only',
    'cross-origin-embedder-policy',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
    'permissions-policy',
    'feature-policy',
    'x-content-type-options',
    'x-frame-options',
    'x-xss-protection',
    'expect-ct',
    'public-key-pins',
    'public-key-pins-report-only',

    // Range requests
    'range',
    'accept-ranges',

    // Conditional requests
    'max-forwards',

    // Redirects
    'refresh',

    // WebSocket
    'sec-websocket-accept',
    'sec-websocket-extensions',
    'sec-websocket-key',
    'sec-websocket-protocol',
    'sec-websocket-version',

    // Fetch metadata
    'sec-fetch-dest',
    'sec-fetch-mode',
    'sec-fetch-site',
    'sec-fetch-user',

    // Other sec-* headers
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'sec-ch-ua-platform-version',
    'sec-ch-ua-full-version',
    'sec-ch-ua-full-version-list',
    'sec-ch-ua-arch',
    'sec-ch-ua-bitness',
    'sec-ch-ua-model',
    'sec-ch-ua-wow64',

    // Client hints
    'accept-ch',
    'accept-ch-lifetime',
    'content-dpr',
    'device-memory',
    'dpr',
    'width',
    'viewport-width',

    // Service worker
    'service-worker-navigation-preload',

    // Reporting
    'report-to',
    'nel',

    // Early hints
    'link',

    // Digest & integrity
    'digest',
    'want-digest',
    'content-md5',

    // Retry & rate limiting
    'retry-after',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',

    // Custom but commonly documented
    'accept-patch',
    'accept-post',
    'timing-allow-origin',
    'cdn-cache-control',
    'surrogate-control',
    'surrogate-key',
    'fastly-debug-digest',
    'x-request-id',
    'x-correlation-id',
    'x-csrf-token',
    'x-http-method-override',
    'x-powered-by',
    'x-robots-tag',
    'x-ua-compatible',
    'x-dns-prefetch-control',
    'x-sourcemap',
    'x-device-user-agent',
    'x-webkit-csp',
]);

/**
 * Get the reference URL for a given HTTP status code
 * Format: https://ref.shokupan.dev/status-codes/{category}xx/{code}/
 */
export function getStatusCodeUrl(statusCode: number): string {
    const category = Math.floor(statusCode / 100);
    return `https://ref.shokupan.dev/status-codes/${category}xx/${statusCode}/`;
}

/**
 * Get the reference URL for a given HTTP header
 * Format: https://ref.shokupan.dev/headers/{header-name}/
 * Returns null if the header is not documented
 */
export function getHeaderUrl(headerName: string): string | null {
    const normalized = headerName.toLowerCase().trim();
    if (!DOCUMENTED_HEADERS.has(normalized)) {
        return null;
    }
    return `https://ref.shokupan.dev/headers/${normalized}/`;
}

/**
 * Check if a header is documented on ref.shokupan.dev
 */
export function isHeaderDocumented(headerName: string): boolean {
    return DOCUMENTED_HEADERS.has(headerName.toLowerCase().trim());
}
