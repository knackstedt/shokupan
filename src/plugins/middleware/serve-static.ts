import { Eta } from 'eta';
import { readdir, stat } from 'fs/promises';
import { basename, join, resolve, sep } from 'path';
import type { ShokupanContext } from '../../context';
import type { Middleware, StaticServeOptions } from '../../util/types';

const eta = new Eta();

export function serveStatic<T extends Record<string, any>>(config: StaticServeOptions<T>, prefix: string) {
    const rootPath = resolve(config.root || ".");
    const normalizedPrefix = prefix.endsWith('/') && prefix !== '/' ? prefix.slice(0, -1) : prefix;

    const serveStaticMiddleware: Middleware = async (ctx: ShokupanContext<any>) => {
        // 1. Calculate relative path
        // ctx.path is full path.
        // If prefix is /static, and path is /static/foo.css, relative is /foo.css
        let relative = ctx.path.slice(normalizedPrefix.length);
        if (!relative.startsWith('/') && relative.length > 0) relative = '/' + relative;
        if (relative.length === 0) relative = '/';

        // Security: Check for null bytes BEFORE decoding
        if (relative.includes('\0')) {
            return ctx.json({ error: 'Forbidden' }, 403);
        }

        // Decode URI components
        try {
            relative = decodeURIComponent(relative);
        } catch (e) {
            // Invalid URL encoding
            return ctx.json({ error: 'Bad Request' }, 400);
        }

        // Security: Check for null bytes AFTER decoding
        if (relative.includes('\0')) {
            return ctx.json({ error: 'Forbidden' }, 403);
        }

        // Security: Check for directory traversal patterns
        if (relative.includes('../') || relative.includes('..\\')) {
            return ctx.json({ error: 'Forbidden' }, 403);
        }

        // Security: Prevent directory traversal with proper path normalization
        const requestPath = resolve(join(rootPath, relative));
        const normalizedRoot = resolve(rootPath);

        // Ensure the resolved path is within the root directory
        // Use separator to prevent partial matching (e.g., /var/www vs /var/www-evil)
        if (!requestPath.startsWith(normalizedRoot + sep) && requestPath !== normalizedRoot) {
            return ctx.json({ error: 'Forbidden' }, 403);
        }

        // Hooks: onRequest
        if (config.hooks?.onRequest) {
            const res = await config.hooks.onRequest(ctx);
            if (res) return res;
        }

        // Check Excludes
        if (config.exclude) {
            for (let i = 0; i < config.exclude.length; i++) {
                const pattern = config.exclude[i];
                if (pattern instanceof RegExp) {
                    if (pattern.test(relative)) return ctx.json({ error: 'Forbidden' }, 403);
                } else if (typeof pattern === 'string') {
                    if (relative.includes(pattern)) return ctx.json({ error: 'Forbidden' }, 403);
                }
            }
        }

        // Dotfiles
        if (basename(requestPath).startsWith('.')) {
            const behavior = config.dotfiles || 'ignore';
            if (behavior === 'deny') return ctx.json({ error: 'Forbidden' }, 403);
            if (behavior === 'ignore') return ctx.json({ error: 'Not Found' }, 404);
        }

        let finalPath = requestPath;
        let stats;

        try {
            stats = await stat(requestPath);
        } catch (e) {
            // Path not found. Try extensions.
            if (config.extensions) {
                for (let i = 0; i < config.extensions.length; i++) {
                    const ext = config.extensions[i];
                    const p = requestPath + (ext.startsWith('.') ? ext : '.' + ext);
                    try {
                        const s = await stat(p);
                        if (s.isFile()) {
                            finalPath = p;
                            stats = s;
                            break;
                        }
                    } catch { }
                }
            }
            if (!stats) return ctx.json({ error: 'Not Found' }, 404);
        }

        // Directory handling
        if (stats.isDirectory()) {
            // Return 302 Redirect to add trailing slash if missing and not root
            // This ensures relative paths in served files work correctly.
            if (!ctx.path.endsWith('/')) {
                const query = ctx.url.search;
                return ctx.redirect(ctx.path + '/' + query, 302);
            }

            // Try indexes
            let indexes: string[] = [];
            if (config.index === undefined) {
                indexes = ['index.html', 'index.htm'];
            }
            else if (Array.isArray(config.index)) {
                indexes = config.index;
            }
            else if (config.index) {
                indexes = [config.index];
            }

            let foundIndex = false;
            for (let i = 0; i < indexes.length; i++) {
                const idx = indexes[i];
                const idxPath = join(finalPath, idx);
                try {
                    const idxStats = await stat(idxPath);
                    if (idxStats.isFile()) {
                        finalPath = idxPath;
                        foundIndex = true;
                        break;
                    }
                } catch { }
            }

            if (!foundIndex) {
                if (config.listDirectory) {
                    // List directory
                    try {
                        const files = await readdir(requestPath);
                        // Simple HTML listing
                        const listing = eta.renderString(`
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
                                        <li><a href="<%= f %>"><%= f %></a></li>
                                    <% }) %>
                                </ul>
                                </body>
                                </html>
                            `, { relative, files, join });
                        return new Response(listing, { headers: { 'Content-Type': 'text/html' } });
                    } catch (e) {
                        return ctx.json({ error: 'Internal Server Error' }, 500);
                    }
                } else {
                    // If no index and no listing, it's 404 or 403. typically 404/403.
                    // Nginx returns 403 Forbidden.
                    return ctx.json({ error: 'Forbidden' }, 403);
                }
            }
        }

        // Serving File
        // @ts-ignore
        let response: Response;

        if (typeof Bun !== "undefined") {
            response = new Response(Bun.file(finalPath));
        } else {
            // Node.js fallback using fs
            // Stream the file instead of buffering to avoid memory spikes
            const { createReadStream } = await import('node:fs');
            const { Readable } = await import('node:stream');

            const fileStream = createReadStream(finalPath);
            // Convert node stream to web stream
            const webStream = Readable.toWeb(fileStream);

            response = new Response(webStream as any);
        }

        if (config.hooks?.onResponse) {
            const hooked = await config.hooks.onResponse(ctx, response);
            if (hooked) response = hooked;
        }
        return response;
    };

    serveStaticMiddleware.isBuiltin = true;
    serveStaticMiddleware.pluginName = 'ServeStatic';

    return serveStaticMiddleware;
}
