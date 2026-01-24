import type { Shokupan } from '../../../shokupan';
import { asyncContext } from '../../../util/async-hooks';
import { getErrorStatus } from '../../../util/http-error';
import type { Middleware, ShokupanPlugin } from '../../../util/types';
import { applyMonkeyPatch } from './monkeypatch';
import { renderErrorView } from './views/error';
import { renderStatusView } from './views/status';

export interface ErrorViewConfig {
    /**
     * Theme for syntax highlighting (default 'dark')
     */
    theme?: 'light' | 'dark';
}

export class ErrorView implements ShokupanPlugin {
    name = 'error-view';

    constructor(private config: ErrorViewConfig = {}) { }

    async onInit(app: Shokupan) {
        // Apply global patches
        applyMonkeyPatch();


        // Create middleware
        const errorViewMiddleware: Middleware = async (ctx, next) => {
            try {
                return await next();
            } catch (err: any) {
                // Only handle if client accepts HTML
                const accept = ctx.get('accept') || '';
                if (!accept.includes('text/html')) {
                    throw err; // Re-throw for JSON/default handler
                }

                // Enhance Error with Metadata (Safe Injection)
                if (!err.timestamp) {
                    Object.defineProperty(err, 'timestamp', {
                        value: Date.now(),
                        enumerable: false,
                        writable: true,
                        configurable: true
                    });
                }

                if (!err.id) {
                    Object.defineProperty(err, 'id', {
                        value: ctx.requestId,
                        enumerable: false,
                        writable: true,
                        configurable: true
                    });
                }

                if (!err.scope) {
                    const store = asyncContext.getStore();
                    if (store) {
                        Object.defineProperty(err, 'scope', {
                            value: { ...store },
                            enumerable: false,
                            writable: true,
                            configurable: true
                        });
                    }
                }

                const status = getErrorStatus(err);

                // If it's a 404 (NotFoundError) or other 4xx, use Status View (Simplified)
                if (status === 404 || status === 401 || status === 403) {
                    // Pass error to status view to extract message
                    const html = await renderStatusView(ctx, status, err);
                    return ctx.html(html, status);
                }

                // For 500s or others, use full Error View with stack trace
                const html = await renderErrorView(ctx, err);
                return ctx.html(html, status);
            }
        };

        // Name it for debugging
        Object.defineProperty(errorViewMiddleware, 'name', { value: 'ErrorViewMiddleware' });

        // Register asset routes
        const { join } = await import('path');
        const assetDir = join(import.meta.dir, 'assets');

        app.static('/_shokupan/error-view', assetDir);

        // Register middleware
        app.use(errorViewMiddleware);
    }
}
