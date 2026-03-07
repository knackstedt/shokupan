
export interface NetworkRequest {
    id: string;
    timestamp: number;
    method: string;
    url: string;
    status: number;
    duration: number;
    remoteIP?: string;
    protocol?: string;
    scheme?: string;
    domain?: string;
    path?: string;
    direction: 'inbound' | 'outbound';
    type?: 'xhr' | 'fetch' | 'ws' | string;
    contentType?: string;
    size?: number;
    transferred?: number;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: any;
    responseBody?: any;
    body?: any; // legacy compatibility
    wsMessages?: any[];
    handlerStack?: any[];
    stackTrace?: string;
    hasRequestBody?: boolean;
    hasResponseBody?: boolean;
}

export function formatBytes(bytes: number, decimals: number = 2): string {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDurationPretty(ms: number): string {
    if (ms === undefined || ms === null) return 'Pending';
    if (ms < 1000) return Math.round(ms) + 'ms';
    const s = ms / 1000;
    if (s < 60) return parseFloat(s.toFixed(1)) + 's';
    const m = Math.floor(s / 60);
    const remS = Math.floor(s % 60);
    if (m < 60) {
        return m + 'm' + (remS > 0 ? remS + 's' : '');
    }
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return h + 'h' + (remM > 0 ? remM + 'm' : '');
}

export function generateFetchCode(req: NetworkRequest): string {
    const headers = req.requestHeaders || {};
    let code = `fetch("${req.url}", {\n`;
    code += `  "method": "${req.method}",\n`;
    code += `  "headers": ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},\n`;

    if (req.requestBody) {
        if (typeof req.requestBody === 'object') {
            code += `  "body": JSON.stringify(${JSON.stringify(req.requestBody)}),\n`;
        } else {
            code += `  "body": ${JSON.stringify(req.requestBody)},\n`;
        }
    }
    code += `});`;
    return code;
}

export function generateCurlCode(req: NetworkRequest): string {
    let cmd = `curl -X ${req.method} "${req.url}"`;
    const headers = req.requestHeaders || {};
    Object.entries(headers).forEach(([k, v]) => {
        cmd += ` \\\n  -H "${k}: ${v}"`;
    });
    const body = req.requestBody || req.body;
    if (body) {
        const bodyStr = typeof body === 'object' ? JSON.stringify(body) : String(body);
        const escaped = bodyStr.replace(/"/g, '\\"');
        cmd += ` \\\n  -d "${escaped}"`;
    }
    return cmd;
}

export function generateHAR(requests: NetworkRequest[]): any {
    return {
        log: {
            version: "1.2",
            creator: { name: "Shokupan Dashboard", version: "1.0" },
            entries: requests.map(req => ({
                startedDateTime: new Date(req.timestamp).toISOString(),
                time: req.duration,
                request: {
                    method: req.method,
                    url: req.url,
                    httpVersion: req.protocol || "HTTP/1.1",
                    cookies: [],
                    headers: Object.entries(req.requestHeaders || {}).map(([name, value]) => ({ name, value })),
                    queryString: [],
                    postData: req.requestBody ? { mimeType: req.contentType || "application/json", text: typeof req.requestBody === 'string' ? req.requestBody : JSON.stringify(req.requestBody) } : undefined,
                    headersSize: -1,
                    bodySize: -1
                },
                response: {
                    status: req.status,
                    statusText: "",
                    httpVersion: req.protocol || "HTTP/1.1",
                    cookies: [],
                    headers: Object.entries(req.responseHeaders || {}).map(([name, value]) => ({ name, value })),
                    content: {
                        size: req.size || 0,
                        mimeType: req.contentType || "",
                        text: typeof (req.body || req.responseBody) === 'string' ? (req.body || req.responseBody) : JSON.stringify(req.body || req.responseBody)
                    },
                    redirectURL: "",
                    headersSize: -1,
                    bodySize: -1
                },
                cache: {},
                timings: {
                    send: 0,
                    wait: req.duration,
                    receive: 0
                }
            }))
        }
    };
}
