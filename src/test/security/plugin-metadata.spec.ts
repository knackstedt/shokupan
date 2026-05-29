import { describe, expect, test } from "bun:test";
import { Dashboard } from "../../plugins/application/dashboard/plugin";
import { DebugPlugin } from "../../plugins/application/debug/plugin";
import { WebAppPlugin } from "../../plugins/application/web-app/plugin";
import { Shokupan } from "../../shokupan";

describe("Security: Plugin Detection via Metadata", () => {
    test("WebAppPlugin.detectPaths uses metadata.pluginName", async () => {
        const app = new Shokupan({ port: 0, development: false });
        const webApp = new WebAppPlugin({ path: '/_app' });
        const debugPlugin = new DebugPlugin({ path: '/debug' });

        await app.register(debugPlugin);
        await app.register(webApp);
        await app.listen();

        const config = (webApp as any).detectPaths();
        expect(config.asyncApi).toBe('/debug/asyncapi');
        expect(config.apiExplorer).toBe('/debug/explorer');

        await app.stop(true);
    });

    test("Dashboard.detectIntegrations uses metadata.pluginName", async () => {
        const app = new Shokupan({ port: 0, development: false });
        const dashboard = new Dashboard({ path: "/admin" });
        const debugPlugin = new DebugPlugin({ path: '/debug' });

        await app.register(debugPlugin);
        await app.register(dashboard);
        await app.listen();

        const integrations = (dashboard as any).detectIntegrations();
        expect(integrations.asyncapi).toBe('/debug/asyncapi');
        expect(integrations.apiExplorer).toBe('/debug/explorer');

        await app.stop(true);
    });
});
