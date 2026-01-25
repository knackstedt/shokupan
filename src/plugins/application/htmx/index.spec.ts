
import { describe, expect, it, mock } from "bun:test";
import { HtmxPlugin } from "./index";

describe("HTMX Plugin", () => {
    it("should register middleware", async () => {
        const plugin = new HtmxPlugin();
        const app = { use: mock() };
        await plugin.onInit(app as any);
        expect(app.use).toHaveBeenCalled();
    });

    it("should extend context", async () => {
        const plugin = new HtmxPlugin();
        const middleware = plugin.middleware();

        const ctx = {
            req: { headers: new Headers() },
            set: mock()
        };
        const next = mock(async () => { });

        await middleware(ctx as any, next);

        // Check properties
        expect(ctx).toHaveProperty('isHtmx');
        expect(ctx).toHaveProperty('trigger');
        expect(ctx).toHaveProperty('pushUrl');

        // Test helpers
        (ctx as any).pushUrl('/test');
        expect(ctx.set).toHaveBeenCalledWith('HX-Push-Url', '/test');

        (ctx as any).trigger('event');
        expect(ctx.set).toHaveBeenCalledWith('HX-Trigger', 'event');
    });
});
