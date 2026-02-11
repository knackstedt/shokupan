import type { Middleware, StaticServeOptions } from '../../util/types';
import { serveStatic } from './serve-static';

/**
 * Creates a static file serving middleware that falls through to the next handler
 * when files are not found, instead of returning 404.
 * 
 * This is useful for scenarios where you want to serve static files first,
 * but fall back to a route handler if the file doesn't exist.
 * 
 * @example
 * ```typescript
 * // Basic usage - serves files from ./dist
 * router.get('/app', Static({ root: './dist' }), async (ctx) => {
 *     // This handler only runs if no static file was found
 *     return ctx.html(await renderSPA());
 * });
 * 
 * // With custom options
 * router.get('/assets', Static({ 
 *     root: './public',
 *     etag: true,
 *     maxAge: 3600
 * }), ctx => ctx.text('Asset not found'));
 * ```
 * 
 * @param options Static serve options or root directory path
 * @param prefix URL prefix to strip from paths (defaults to '/')
 * @returns Middleware that serves static files or calls next()
 */
export function Static<T extends Record<string, any>>(
    options: string | StaticServeOptions<T>,
    prefix: string = '/'
): Middleware {
    const config: StaticServeOptions<T> = typeof options === 'string' ? { root: options } : options;

    // Create the base static middleware with the specified prefix
    const staticMiddleware = serveStatic(config, prefix);

    // Wrap it to catch 404s and call next() instead
    const fallthrough: Middleware = async (ctx, next) => {
        try {
            const result = await staticMiddleware(ctx, next);

            // If serveStatic returned a 404, call next() instead
            if (result instanceof Response && result.status === 404) {
                return next();
            }

            return result;
        } catch (error) {
            // On any error, fall through to next handler
            return next();
        }
    };

    // Preserve metadata
    (fallthrough as any).isBuiltin = true;
    (fallthrough as any).pluginName = 'Static (Fallthrough)';

    return fallthrough;
}
