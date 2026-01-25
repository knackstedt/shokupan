
import { ShokupanContext } from "../../../context";
import type { Shokupan } from "../../../shokupan";
import type { Middleware, ShokupanPlugin } from "../../../util/types";

/**
 * Extends the ShokupanContext interface with HTMX specific helpers.
 */
declare module "../../../context" {
    interface ShokupanContext {
        /**
         * Checks if the request is an HTMX request.
         */
        isHtmx: boolean;
        /**
         * Checks if the request is boosting.
         */
        isHtmxBoosted: boolean;
        /**
         * Sets the HX-Trigger header.
         */
        trigger(event: string | Record<string, any>, options?: { after?: 'receive' | 'settle' | 'swap'; }): void;
        /**
         * Sets the HX-Push-Url header.
         */
        pushUrl(url: string | false): void;
        /**
         * Sets the HX-Redirect header.
         */
        htmxRedirect(url: string): void;
        /**
         * Sets the HX-Refresh header.
         */
        refresh(): void;
    }
}

export class HtmxPlugin implements ShokupanPlugin {
    async onInit(app: Shokupan) {
        app.use(this.middleware());
    }

    middleware(): Middleware {
        return async (ctx: ShokupanContext, next: () => Promise<any>) => {
            // Helpers
            Object.defineProperty(ctx, 'isHtmx', {
                get: () => ctx.req.headers.has('hx-request')
            });

            Object.defineProperty(ctx, 'isHtmxBoosted', {
                get: () => ctx.req.headers.has('hx-boosted')
            });

            ctx.trigger = (event: string | Record<string, any>, options?: { after?: 'receive' | 'settle' | 'swap'; }) => {
                let headerName = 'HX-Trigger';
                if (options?.after === 'settle') headerName = 'HX-Trigger-After-Settle';
                if (options?.after === 'swap') headerName = 'HX-Trigger-After-Swap';

                let value = JSON.stringify(event);
                // If simple string key with no data, can handle differently or just JSON object. 
                // HTMX supports simple names or JSON map.
                if (typeof event === 'string') {
                    // For single event name, just send it, unless we want to support args? 
                    // Usually JSON is safest.
                    value = event;
                } else {
                    value = JSON.stringify(event);
                }

                ctx.set(headerName, value);
            };

            ctx.pushUrl = (url: string | false) => {
                ctx.set('HX-Push-Url', url === false ? 'false' : url);
            };

            ctx.htmxRedirect = (url: string) => {
                ctx.set('HX-Redirect', url);
            };

            ctx.refresh = () => {
                ctx.set('HX-Refresh', 'true');
            };

            // Process request
            return next();
        };
    }
}
