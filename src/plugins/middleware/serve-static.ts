import { Stats } from 'fs';
import { readdir, stat } from 'fs/promises';
import { lookup } from 'mrmime';
import { join, resolve } from 'path';
import type { ShokupanContext } from '../../context';
import type { Middleware, StaticServeOptions } from '../../util/types';

let eta: any;
async function getEta() {
    if (!eta) {
        const { Eta } = await import('eta');
        eta = new Eta();
    }
    return eta;
}

interface FileData {
    abs: string;
    stats: Stats;
    headers: Record<string, any>;
}

export function serveStatic<T extends Record<string, any>>(config: StaticServeOptions<T>, prefix: string) {
    const rootPath = resolve(config.root || ".");
    const normalizedPrefix = prefix.endsWith('/') && prefix !== '/' ? prefix.slice(0, -1) : prefix;
    const isEtag = !!config.etag;
    const extensions = config.extensions || ['html', 'htm', 'htmx'];
    // Refactor R4: useCache:true (or unspecified) means the in-memory cache IS active.
    // The old code had the condition inverted — !config.useCache triggered the cache walk.
    const cacheEnabled = config.useCache !== false;
    const FILES: Record<string, FileData> = {};

    // P3: Expose a ready() Promise so callers can optionally await full cache population.
    let _resolveReady!: () => void;
    const _ready = new Promise<void>(resolve => { _resolveReady = resolve; });

    // Helper: Generate Headers
    function toHeaders(name: string, stats: Stats, isEtag: boolean) {
        const ctype = lookup(name) || 'application/octet-stream';
        const headers: Record<string, any> = {
            'Content-Length': stats.size,
            'Content-Type': ctype,
            'Last-Modified': stats.mtime.toUTCString(),
        };
        if (isEtag) headers['ETag'] = `W/"${stats.size}-${stats.mtime.getTime()}"`;
        if (config.maxAge) {
            let cc = `public,max-age=${config.maxAge}`;
            if (config.immutable) cc += ',immutable';
            headers['Cache-Control'] = cc;
        }
        return headers;
    }

    // Optimization: Pre-load files into memory when cache is enabled
    if (cacheEnabled) {
        async function walk(dir: string) {
            const entries = await readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const res = resolve(dir, entry.name);
                if (entry.isDirectory()) {
                    await walk(res);
                } else {
                    const stats = await stat(res) as Stats;
                    const headers = toHeaders(entry.name, stats, isEtag);
                    const rel = res.slice(rootPath.length).replace(/\\/g, '/');
                    FILES[rel] = { abs: res, stats, headers };
                }
            }
        }
        walk(rootPath)
            .then(_resolveReady)
            .catch(err => {
                if (process.env.NODE_ENV !== 'test') console.error('[serveStatic] Cache population error:', err);
                _resolveReady();
            });
    } else {
        // No cache — resolve immediately so ready() doesn't block
        _resolveReady();
    }

    const serveStaticMiddleware: Middleware = async (ctx: ShokupanContext<any>) => {
        let reqPath = ctx.params?.['*'] ?? ctx.path.slice(normalizedPrefix.length);
        if (!reqPath.startsWith('/')) reqPath = '/' + reqPath;

        try {
            reqPath = decodeURIComponent(reqPath);
        } catch {
            return ctx.json({ error: 'Bad Request' }, 400);
        }

        if (reqPath.includes('\0') || reqPath.includes('..')) {
            return ctx.json({ error: 'Forbidden' }, 403);
        }

        let file: FileData | undefined;

        // 1. Lookup in Cache (if enabled)
        if (cacheEnabled) {
            file = FILES[reqPath];
            if (!file) {
                // Try extensions
                for (const ext of extensions) {
                    file = FILES[reqPath + (ext.startsWith('.') ? ext : '.' + ext)];
                    if (file) break;
                }
            }
            if (!file) {
                // Try index
                for (const ext of extensions) {
                    file = FILES[join(reqPath, 'index.' + ext).replace(/\\/g, '/')]; // simplified
                    // This is a bit rough for the map key matching, could improve later.
                    if (!file) file = FILES[join(reqPath, 'index' + (ext.startsWith('.') ? ext : '.' + ext)).replace(/\\/g, '/')];
                    if (file) break;
                }
            }
        }

        // 2. Lookup on Disk (if dev or not found in cache)
        if (!file) {
            try {
                let abs = join(rootPath, reqPath);

                // Security check
                if (!resolve(abs).startsWith(rootPath) && resolve(abs) !== rootPath) {
                    return ctx.json({ error: 'Forbidden' }, 403);
                }

                let stats = await stat(abs).catch(() => null);

                // Try extensions
                if (!stats) {
                    for (const ext of extensions) {
                        const p = abs + (ext.startsWith('.') ? ext : '.' + ext);
                        stats = await stat(p).catch(() => null);
                        if (stats && stats.isFile()) {
                            abs = p;
                            break;
                        }
                    }
                }

                // Try index
                if (stats && stats.isDirectory()) {
                    // Redirect if no trailing slash
                    if (!ctx.path.endsWith('/')) {
                        return ctx.redirect(ctx.path + '/' + ctx.url.search, 302);
                    }

                    for (const ext of extensions) {
                        const p = join(abs, 'index' + (ext.startsWith('.') ? ext : '.' + ext));
                        const s = await stat(p).catch(() => null);
                        if (s && s.isFile()) {
                            abs = p;
                            stats = s;
                            break;
                        }
                    }
                }

                if (stats && stats.isFile()) {
                    file = {
                        abs: resolve(abs),
                        stats: stats as Stats,
                        headers: toHeaders(abs, stats as Stats, isEtag)
                    };
                }

                // Directory Listing Fallback
                if (!file && stats?.isDirectory() && config.listDirectory) {
                    const files = await readdir(abs);
                    const listing = (await getEta()).renderString(`
                                 <!DOCTYPE html>
                                 <html>
                                 <head>
                                     <title>Index of <%= it.relative %></title>
                                     <style>
                                         body { font-family: system-ui, -apple-system, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
                                         ul { list-style: none; padding: 0; }
                                         li { padding: 0.5rem 0; border-bottom: 1px solid #eee; }
                                         a { text-decoration: none; color: #0066cc; }
                                         a:hover { text-decoration: underline; }
                                         h1 { font-size: 1.5rem; margin-bottom: 1rem; }
                                     </style>
                                 </head>
                                 <body>
                                 <h1>Index of <%= it.relative %></h1>
                                 <ul>
                                     <% if (it.relative !== '/') { %>
                                         <li><a href="../">../</a></li>
                                     <% } %>
                                     <% it.files.forEach(function(f) { %>
                                         <li><a href="<%= encodeURIComponent(f) %>"><%= f %></a></li>
                                     <% }) %>
                                 </ul>
                                 </body>
                                 </html>
                             `, { relative: reqPath, files, join });
                    return new Response(listing, { headers: { 'Content-Type': 'text/html' } });
                }

            } catch (e) { }
        }

        if (!file) return ctx.json({ error: 'Not Found' }, 404);

        // 3. Serve File

        // ETag check
        if (isEtag && ctx.request.headers.get('if-none-match') === file.headers['ETag']) {
            return new Response(null, { status: 304, headers: file.headers });
        }

        // Range Support
        const range = ctx.request.headers.get('range');
        let status = 200;
        let headers = { ...file.headers };
        let start = 0;
        let end = file.stats.size - 1;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            start = parseInt(parts[0], 10);
            end = parts[1] ? parseInt(parts[1], 10) : file.stats.size - 1;

            if (start >= file.stats.size) {
                return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.stats.size}` } });
            }

            status = 206;
            headers['Content-Range'] = `bytes ${start}-${end}/${file.stats.size}`;
            headers['Content-Length'] = end - start + 1;
            headers['Accept-Ranges'] = 'bytes';
        }

        let response: Response;
        if (typeof Bun !== "undefined") {
            const bunFile = Bun.file(file.abs);
            let body: any; // Declare body here for Bun branch
            if (range) {
                body = bunFile.slice(start, end + 1);
            } else {
                body = bunFile;
            }
            response = new Response(body, { status, headers });
        } else {
            // Node.js fallback using fs
            const { createReadStream } = await import('node:fs');
            const { Readable } = await import('node:stream');

            const fileStream = createReadStream(file.abs, { start, end });
            // Convert to Web Stream for standard Response compliance
            // @ts-ignore
            const webStream = Readable.toWeb(fileStream);

            response = new Response(webStream as any, { status, headers });
            // Attach raw node stream for NodeAdapter optimization (avoid overhead)
            (response as any).nodeStream = fileStream;
        }

        if (config.hooks?.onResponse) {
            const hooked = await config.hooks.onResponse(ctx, response);
            if (hooked) return hooked;
        }

        return response;
    };

    serveStaticMiddleware.isBuiltin = true;
    serveStaticMiddleware.pluginName = 'ServeStatic';
    // P3: Expose ready() so callers can await full cache population before serving.
    // Example: await serveStatic(cfg, '/').ready;
    (serveStaticMiddleware as any).ready = _ready;

    return serveStaticMiddleware;
}
