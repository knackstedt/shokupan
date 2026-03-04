import type { IncomingMessage } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { createLogger, type Logger } from '../../../util/logger';

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
    /**
     * The actual size of the response body in bytes.
     */
    responseSize?: number;
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
    private static originalFetch: typeof global.fetch | undefined;
    private static originalHttpRequest: typeof http.request | undefined;
    private static originalHttpsRequest: typeof https.request | undefined;

    private originalFetch: typeof global.fetch;
    private originalHttpRequest: typeof http.request;
    private originalHttpsRequest: typeof https.request;
    private callbacks: OutboundRequestCallback[] = [];
    private isPatched: boolean = false;
    private logger: Logger;

    constructor(logger?: Logger) {
        this.logger = logger || createLogger();
        // Capture originals on first instantiation if not already captured
        if (!FetchInterceptor.originalFetch) {
            // Prevent capturing already patched fetch if module was reloaded but global stays dirty
            if ((global.fetch as any).__isPatched) {
                // Try to find original fetch if possible, or warn? 
                // If we can't find original, we might be stuck.
                // But hopefully we don't reload module while patched.
                // Assuming standard behavior:
                // We use process.stderr directly for this static warning since we don't have an instance logger context easily available
                // and we want to avoid console object.
                if (process.env.NODE_ENV !== 'test') {
                    process.stderr.write('[FetchInterceptor] Global fetch is already patched! Cannot capture original.\n');
                }
            } else {
                FetchInterceptor.originalFetch = global.fetch;
                FetchInterceptor.originalHttpRequest = http.request;
                FetchInterceptor.originalHttpsRequest = https.request;
            }
        }

        this.originalFetch = FetchInterceptor.originalFetch || global.fetch;
        this.originalHttpRequest = FetchInterceptor.originalHttpRequest || http.request;
        this.originalHttpsRequest = FetchInterceptor.originalHttpsRequest || https.request;
    }

    /**
     * Statically restore the original network methods.
     * Useful for cleaning up in tests.
     */
    /**
     * Statically restore the original network methods.
     * Useful for cleaning up in tests.
     */
    public static restore() {
        if (FetchInterceptor.originalFetch) {
            global.fetch = FetchInterceptor.originalFetch;
        } else if ((global.fetch as any)?.__originalFetch) {
            // Fallback: Restore from attached property if static was lost
            global.fetch = (global.fetch as any).__originalFetch;
        } else if (typeof Bun !== 'undefined' && (Bun as any).fetch) {
            // Fallback: Restore Bun.fetch if in Bun environment (cleans up zombie patches)
            global.fetch = (Bun as any).fetch;
        }

        if (FetchInterceptor.originalHttpRequest) {
            http.request = FetchInterceptor.originalHttpRequest;
        }
        if (FetchInterceptor.originalHttpsRequest) {
            https.request = FetchInterceptor.originalHttpsRequest;
        }
        if (process.env.NODE_ENV !== 'test') {
            process.stdout.write('[FetchInterceptor] Network layer restored (static).\n');
        }
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
        this.logger.debug('FetchInterceptor', 'Network layer patched.');
    }

    private patchGlobalFetch() {
        const self = this;
        // If we don't have a valid originalFetch (e.g. lost due to reload)
        // and global.fetch is patched, try to recover it from the patched version
        if (!this.originalFetch && (global.fetch as any).__isPatched && (global.fetch as any).__originalFetch) {
            this.originalFetch = (global.fetch as any).__originalFetch;
        }

        const newFetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            const startTime = performance.now();
            const timestamp = Date.now();

            let url = '';
            let method = 'GET';
            let requestHeaders: Record<string, string> = {};

            try {
                if (typeof input === 'string') {
                    url = input;
                } else if (input instanceof URL) {
                    url = input.toString();
                } else if (input instanceof Request) {
                    url = input.url;
                    method = input.method;
                    input.headers.forEach((v, k) => requestHeaders[k] = v);
                }

                if (init) {
                    if (init.method) method = init.method.toUpperCase();
                    if (init.headers) {
                        const h = new Headers(init.headers);
                        h.forEach((v, k) => requestHeaders[k] = v);
                    }
                }
            } catch (e) { }

            try {
                const response = await self.originalFetch.apply(global, [input, init]);

                // Clone response to read body without consuming original
                const clone = response.clone();
                const duration = performance.now() - startTime;

                // Process response asynchronously to not block
                self.processResponse(clone, {
                    method,
                    url,
                    requestHeaders,
                    startTime: timestamp,
                    duration,
                    status: response.status,
                    ...self.extractRequestMeta(url, requestHeaders)
                }).catch(err => self.logger.error('FetchInterceptor', "Error processing response:", { error: err }));

                return response;
            } catch (error) {
                const duration = performance.now() - startTime;
                self.notify({
                    method,
                    url,
                    requestHeaders,
                    status: 0,
                    responseHeaders: {},
                    startTime: timestamp,
                    duration,
                    responseBody: `Error: ${error.message}`,
                    ...self.extractRequestMeta(url, requestHeaders)
                });
                throw error;
            }
        };

        // Attach metadata
        (newFetch as any).__isPatched = true;
        (newFetch as any).__originalFetch = this.originalFetch;

        global.fetch = newFetch as any;
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
        this.logger.debug('FetchInterceptor', 'Network layer restored.');
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
        let responseSize = 0;

        try {
            // Check content type to decide how to read
            const contentType = response.headers.get('content-type') || '';
            let bodyText = '';
            const contentEncoding = response.headers.get('content-encoding') || '';
            const isCompressed = contentEncoding && contentEncoding !== 'identity' && contentEncoding !== 'none';
            const isTextLike = contentType.includes('application/json') || contentType.includes('text/') || contentType.includes('xml') || contentType.includes('javascript') || contentType.includes('css');

            if (isTextLike && !isCompressed) {
                bodyText = await response.text();
                // truncate if too large
                if (bodyText.length > 524288) { // 512KB limit from previous task
                    responseBody = bodyText.substring(0, 524288) + '... (truncated)';
                } else {
                    responseBody = bodyText;
                }
            } else {
                const buffer = await response.arrayBuffer();
                responseSize = buffer.byteLength;
                transferred = responseSize;

                if (responseSize > 0) {
                    if (responseSize > 1024 * 1024) {
                        responseBody = `[Binary Content: ${responseSize} bytes (too large)]`;
                    } else {
                        responseBody = {
                            __binary: true,
                            data: Buffer.from(buffer).toString('base64'),
                            length: responseSize
                        };
                    }
                } else {
                    responseBody = undefined;
                }
            }

            if (!responseSize && bodyText) {
                responseSize = bodyText.length;
            }

            // Calculate transferred size (headers + body)
            // Approximate headers size
            const headersSize = Object.entries(responseHeaders).reduce((acc, [k, v]) => acc + k.length + (v?.length || 0) + 2, 0);
            if (!transferred) {
                transferred = headersSize + responseSize;
            } else {
                transferred += headersSize;
            }
        } catch (e) {
            responseBody = '[Failed to read response body]';
        }

        this.notify({
            ...meta,
            responseHeaders,
            responseBody,
            responseSize,
            transferred
        });
    }

    private notify(log: OutboundRequestLog) {
        this.callbacks.forEach(cb => {
            try {
                cb(log);
            } catch (e) {
                this.logger.error('FetchInterceptor', 'Callback failed', { error: e });
            }
        });
    }
}
