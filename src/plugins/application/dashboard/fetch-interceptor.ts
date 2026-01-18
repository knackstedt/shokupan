import type { IncomingMessage } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';

const require = createRequire(import.meta.url);
const http = require('node:http');
const https = require('node:https');


/**
 * Interface representing the details of an intercepted outbound request.
 */
export interface OutboundRequestLog {
    /**
     * The HTTP method of the request (e.g., GET, POST).
     */
    method: string;
    /**
     * The full URL of the request.
     */
    url: string;
    /**
     * The request headers.
     */
    requestHeaders: Record<string, string>;
    /**
     * The HTTP status code of the response.
     */
    status: number;
    /**
     * The response headers.
     */
    responseHeaders: Record<string, string>;
    /**
     * The duration of the request in milliseconds.
     */
    duration: number;
    /**
     * The timestamp when the request started.
     */
    startTime: number;
    /**
     * The request body (if any).
     */
    requestBody?: any;
    /**
     * The response body (if any).
     */
    responseBody?: any;
    /**
     * The hostname of the request.
     */
    domain?: string;
    /**
     * The pathname of the request.
     */
    path?: string;
    /**
     * The protocol scheme (http/https) or version (1.1, 2.0).
     */
    protocol?: string;
    /**
     * The protocol scheme (http/https).
     */
    scheme?: string;
    /**
     * The remote IP address (if available).
     */
    remoteIP?: string;
    /**
     * The number of cookies sent.
     */
    cookies?: number;
    /**
     * The estimated transfer size in bytes.
     */
    transferred?: number;
}

/**
 * A callback function type for handling captured outbound requests.
 */
export type OutboundRequestCallback = (log: OutboundRequestLog) => void;

/**
 * A utility class that intercepts calls to `global.fetch` to track outbound HTTP requests.
 * 
 * @warning This class monkey-patches the global `fetch` function. While it attempts to transparently
 * pass through all calls, it may have side effects on global state or other libraries that rely on
 * the original `fetch`. Proceed with caution.
 */
export class FetchInterceptor {
    private originalFetch: typeof global.fetch;
    private originalHttpRequest: typeof http.request;
    private originalHttpsRequest: typeof https.request;
    private callbacks: OutboundRequestCallback[] = [];
    private isPatched: boolean = false;

    constructor() {
        this.originalFetch = global.fetch;
        this.originalHttpRequest = http.request;
        this.originalHttpsRequest = https.request;
    }

    /**
     * Patches the global `fetch` function to intercept requests.
     * If already patched, this method does nothing.
     */
    public patch() {
        if (this.isPatched) return;

        this.patchGlobalFetch();
        this.patchNodeRequests();

        this.isPatched = true;
        console.log('[FetchInterceptor] Network layer patched.');
    }

    private patchGlobalFetch() {
        const self = this;
        const newFetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {

            const startTime = performance.now();
            const timestamp = Date.now();
            let method = 'GET';
            let url = '';
            let requestHeaders: Record<string, string> = {};
            let requestBody: any = undefined;

            // Extract request details
            try {
                if (input instanceof URL) {
                    url = input.toString();
                } else if (typeof input === 'string') {
                    url = input;
                } else if (typeof input === 'object' && 'url' in input) {
                    url = input.url;
                    method = input.method;
                }

                if (init) {
                    if (init.method) method = init.method;
                    if (init.headers) {
                        if (init.headers instanceof Headers) {
                            init.headers.forEach((v, k) => requestHeaders[k] = v);
                        } else if (Array.isArray(init.headers)) {
                            init.headers.forEach(([k, v]) => requestHeaders[k] = v);
                        } else {
                            Object.assign(requestHeaders, init.headers);
                        }
                    }
                    if (init.body) requestBody = init.body;
                }
            } catch (e) {
                console.warn('[FetchInterceptor] Failed to parse request arguments', e);
            }

            try {
                const response = await self.originalFetch.apply(global, [input, init]);
                const clone = response.clone();
                const duration = performance.now() - startTime;

                self.processResponse(clone, {
                    method,
                    url,
                    requestHeaders,
                    requestBody,
                    status: response.status,
                    startTime: timestamp,
                    duration,
                    ...self.extractRequestMeta(url, requestHeaders),
                    protocol: '1.1' // native fetch doesn't expose this easily, assume 1.1/2
                });

                return response;
            } catch (error) {
                const duration = performance.now() - startTime;
                self.notify({
                    method,
                    url,
                    requestHeaders,
                    requestBody,
                    status: 0,
                    responseHeaders: {},
                    responseBody: `Network Error: ${String(error)}`,
                    startTime: timestamp,
                    duration
                });
                throw error;
            }
        };

        // Copy static methods like preconnect
        Object.assign(newFetch, this.originalFetch);

        global.fetch = newFetch as typeof global.fetch;
    }

    private patchNodeRequests() {
        const self = this;
        const intercept = (module: typeof http | typeof https, original: Function, defaultScheme: string) => {
            // @ts-ignore
            module.request = function (...args: any[]) {
                const startTime = performance.now();
                const timestamp = Date.now();
                let options: any = {};
                let urlObj: URL | undefined;

                // Argument normalization
                if (typeof args[0] === 'string' || args[0] instanceof URL) {
                    try {
                        urlObj = new URL(args[0]);
                        options = typeof args[1] === 'object' ? args[1] : {};
                    } catch (e) { }
                } else {
                    options = args[0] || {};
                    try {
                        const protocol = options.protocol || defaultScheme + ':';
                        const host = options.hostname || options.host || 'localhost';
                        const port = options.port ? ':' + options.port : '';
                        const path = options.path || '/';
                        urlObj = new URL(`${protocol}//${host}${port}${path}`);
                    } catch (e) { }
                }

                const method = (options.method || 'GET').toUpperCase();
                const url = urlObj ? urlObj.toString() : 'unknown';

                // Call original
                const req = original.apply(this, args);

                // Helper to get headers
                const getReqHeaders = () => {
                    try {
                        const h = req.getHeaders();
                        // Normalize
                        const normalized: Record<string, string> = {};
                        for (const k in h) {
                            const v = h[k];
                            normalized[k] = Array.isArray(v) ? v.join(', ') : String(v);
                        }
                        return normalized;
                    } catch (e) { return {}; }
                };

                // Intercept response
                req.on('response', (res: IncomingMessage) => {
                    const duration = performance.now() - startTime;

                    // Normalize response headers
                    const resHeaders: Record<string, string> = {};
                    if (res.headers) {
                        for (const k in res.headers) {
                            const v = res.headers[k];
                            resHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v || '');
                        }
                    }

                    self.notify({
                        method,
                        url,
                        requestHeaders: getReqHeaders(),
                        status: res.statusCode || 0,
                        responseHeaders: resHeaders,
                        startTime: timestamp,
                        duration,
                        ...self.extractRequestMeta(url, getReqHeaders()),
                        protocol: req.httpVersion
                    });
                });

                req.on('error', (err: Error) => {
                    const duration = performance.now() - startTime;
                    self.notify({
                        method,
                        url,
                        requestHeaders: getReqHeaders(),
                        status: 0,
                        responseHeaders: {},
                        responseBody: `Error: ${err.message}`, // Capture error
                        startTime: timestamp,
                        duration
                    });
                });

                return req;
            };
        };

        intercept(http, this.originalHttpRequest, 'http');
        intercept(https, this.originalHttpsRequest, 'https');
    }

    /**
     * Restores the original functions.
     */
    public unpatch() {
        if (!this.isPatched) return;
        global.fetch = this.originalFetch;
        http.request = this.originalHttpRequest;
        https.request = this.originalHttpsRequest;

        this.isPatched = false;
        console.log('[FetchInterceptor] Network layer restored.');
    }

    /**
     * Adds a callback to be notified of outbound requests.
     * @param callback The callback function.
     */
    public on(callback: OutboundRequestCallback) {
        this.callbacks.push(callback);
    }

    private extractRequestMeta(urlStr: string, headers: Record<string, string>) {
        try {
            const url = new URL(urlStr);
            const cookiesHeader = headers['cookie'] || headers['Cookie'];
            const cookies = cookiesHeader ? cookiesHeader.split(';').length : 0;
            return {
                domain: url.hostname,
                path: url.pathname,
                scheme: url.protocol.replace(':', ''),
                cookies,
                remoteIP: undefined // Not easily accessible via fetch
            };
        } catch (e) {
            return {};
        }
    }

    private async processResponse(response: Response, meta: any) {
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => responseHeaders[k] = v);

        let responseBody: any;
        let transferred = 0;

        try {
            // Check content type to decide how to read
            const contentType = response.headers.get('content-type') || '';
            let bodyText = '';

            if (contentType.includes('application/json') || contentType.includes('text/')) {
                bodyText = await response.text();
                // truncate if too large
                if (bodyText.length > 524288) { // 512KB limit from previous task
                    responseBody = bodyText.substring(0, 524288) + '... (truncated)';
                } else {
                    responseBody = bodyText;
                }
            } else {
                responseBody = '[Binary Content]';
                // Try to get size from content-length if binary
                const cl = response.headers.get('content-length');
                if (cl) transferred = parseInt(cl, 10);
            }

            // Calculate transferred size (headers + body)
            // Approximate headers size
            const headersSize = Object.entries(responseHeaders).reduce((acc, [k, v]) => acc + k.length + v.length + 2, 0);
            if (!transferred && bodyText) {
                transferred = headersSize + bodyText.length;
            } else if (!transferred) {
                transferred = headersSize; // minimal fallback
            }

        } catch (e) {
            responseBody = '[Failed to read response body]';
        }

        this.notify({
            ...meta,
            responseHeaders,
            responseBody,
            transferred
        });
    }

    private notify(log: OutboundRequestLog) {
        this.callbacks.forEach(cb => {
            try {
                cb(log);
            } catch (e) {
                console.error('[FetchInterceptor] Callback failed', e);
            }
        });
    }
}
