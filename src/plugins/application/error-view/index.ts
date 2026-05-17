import type { Shokupan } from '../../../shokupan';
import { existsSync } from 'node:fs';
import { asyncContext } from '../../../util/async-hooks';
import { getErrorStatus } from '../../../util/http-error';
import type { Middleware, ShokupanPlugin } from '../../../util/types';
import { applyMonkeyPatch } from './monkeypatch';
import { getReasonPhrase } from './reason-phrases';
import { renderErrorView } from './views/error';
import { renderStatusView } from './views/status';

export interface ErrorViewConfig {
    /**
     * Theme for syntax highlighting (default 'dark')
     */
    theme?: 'light' | 'dark';
    /**
     * Show the graphical status view instead of the error view if not in development mode.
     * Default: true
     */
    productionStatusView?: boolean;
    /**
     * Show the detailed error view if in development mode.
     * Default: true
     */
    developmentErrorView?: boolean;
    /**
     * Hide the code snippet from the detailed error view.
     * Default: false
     */
    hideCode?: boolean;
    /**
     * Hide the stack trace from the detailed error view.
     * Default: false
     */
    hideStacktrace?: boolean;
    /**
     * Hide the error message from the status view.
     * Default: false
     */
    hideErrorMessage?: boolean;
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
                const res = await next();

                // Handle manual status codes (e.g. ctx.status(404)) with no body
                if (ctx.response.status >= 400 && !ctx.responseBody) {
                    const accept = ctx.get('accept') || '';
                    if (accept.includes('text/html')) {
                        // Create a synthetic error to pass to the view logic
                        const err = new Error(getReasonPhrase(ctx.response.status));
                        (err as any).status = ctx.response.status;
                        throw err;
                    }
                }

                return res;
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
                const isDev = process.env.NODE_ENV === 'development';

                const showDetailedConfig = this.config.developmentErrorView !== false;
                const showStatusConfig = this.config.productionStatusView !== false;

                // Decide which view to show
                // If dev and detailed view enabled -> Error View
                // Else if status view enabled -> Status View
                // Else -> rethrow (should be handled by default JSON handler or other)

                const shouldShowDetailed = isDev && showDetailedConfig;
                // If we shouldn't show detailed, we check if we should show status view
                // This applies to prod (by default) AND dev (if detailed is disabled)
                const shouldShowStatus = (!shouldShowDetailed && showStatusConfig);

                if (shouldShowStatus) {
                    // Pass error to status view to extract message
                    const html = await renderStatusView(ctx, status, err, {
                        requestId: ctx.requestId,
                        hideErrorMessage: this.config.hideErrorMessage
                    });
                    return ctx.html(html, status);
                }

                if (shouldShowDetailed) {
                    // For 500s or others, use full Error View with stack trace
                    const html = await renderErrorView(ctx, err, {
                        hideCode: this.config.hideCode,
                        hideStacktrace: this.config.hideStacktrace
                    });
                    return ctx.html(html, status);
                }

                // If neither view is selected, re-throw to let other handlers manage it (e.g. JSON)
                throw err;
            }
        };

        // Name it for debugging
        Object.defineProperty(errorViewMiddleware, 'name', { value: 'ErrorViewMiddleware' });

        // Register asset routes
        const { join } = await import('path');
        const assetDir = join(import.meta.dir, 'assets');

        if (existsSync(assetDir)) {

            app.static('/_shokupan/error-view', assetDir);
        }

        // Register middleware
        app.use(errorViewMiddleware);
    }
}
