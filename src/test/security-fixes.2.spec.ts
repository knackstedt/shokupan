import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AsyncApiPlugin } from "../plugins/application/asyncapi/plugin";
import { FetchInterceptor } from "../plugins/application/dashboard/fetch-interceptor";
import { Dashboard } from "../plugins/application/dashboard/plugin";
import { DebugPlugin } from "../plugins/application/debug/plugin";
import { WebAppPlugin } from "../plugins/application/web-app/plugin";
import { Shokupan } from "../shokupan";

describe("Security Fixes", () => {
    describe("DebugPlugin.checkPermission", () => {
        test("allows access when no permissions configured", async () => {
            const plugin = new DebugPlugin({ apiExplorer: { enabled: true } });
            const ctx = { user: null } as any;
            // Use reflection to call private method
            const result = (plugin as any).checkPermission(ctx, { enabled: true });
            expect(result).toBe(true);
        });

        test("denies access when user is missing", async () => {
            const plugin = new DebugPlugin({
                apiExplorer: { enabled: true, permissions: { resource: 'debug', action: 'read' } }
            });
            const ctx = {} as any;
            const result = (plugin as any).checkPermission(ctx, (plugin as any).pluginOptions.apiExplorer);
            expect(result).toBe(false);
        });

        test("denies access when user lacks required permission", async () => {
            const plugin = new DebugPlugin({
                apiExplorer: { enabled: true, permissions: { resource: 'debug', action: 'read' } }
            });
            const ctx = { user: { permissions: ['other:write'] } } as any;
            const result = (plugin as any).checkPermission(ctx, (plugin as any).pluginOptions.apiExplorer);
            expect(result).toBe(false);
        });

        test("allows access with exact permission string", async () => {
            const plugin = new DebugPlugin({
                apiExplorer: { enabled: true, permissions: { resource: 'debug', action: 'read' } }
            });
            const ctx = { user: { permissions: ['debug:read'] } } as any;
            const result = (plugin as any).checkPermission(ctx, (plugin as any).pluginOptions.apiExplorer);
            expect(result).toBe(true);
        });

        test("allows access with wildcard permission", async () => {
            const plugin = new DebugPlugin({
                apiExplorer: { enabled: true, permissions: { resource: 'debug', action: 'read' } }
            });
            const ctx = { user: { permissions: ['*:*'] } } as any;
            const result = (plugin as any).checkPermission(ctx, (plugin as any).pluginOptions.apiExplorer);
            expect(result).toBe(true);
        });

        test("allows access with object permission", async () => {
            const plugin = new DebugPlugin({
                apiExplorer: { enabled: true, permissions: { resource: 'debug', action: 'read' } }
            });
            const ctx = { user: { permissions: [{ resource: 'debug', action: 'read' }] } } as any;
            const result = (plugin as any).checkPermission(ctx, (plugin as any).pluginOptions.apiExplorer);
            expect(result).toBe(true);
        });
    });

    describe("AsyncApiPlugin.checkPermission", () => {
        test("denies access when user lacks required permission", async () => {
            const plugin = new AsyncApiPlugin({ permissions: { resource: 'asyncapi', action: 'read' } });
            const ctx = { user: { permissions: ['other:write'] } } as any;
            const result = (plugin as any).checkPermission(ctx);
            expect(result).toBe(false);
        });

        test("allows access with correct permission", async () => {
            const plugin = new AsyncApiPlugin({ permissions: { resource: 'asyncapi', action: 'read' } });
            const ctx = { user: { permissions: ['asyncapi:read'] } } as any;
            const result = (plugin as any).checkPermission(ctx);
            expect(result).toBe(true);
        });
    });

    describe("Path Traversal Protection", () => {
        let app: Shokupan;
        let server: any;
        let port = 0;

        beforeAll(async () => {
            app = new Shokupan({ enableAsyncApiGen: true, blockOnAsyncApiGen: true, enableAsyncAstScanning: false });
            app.register(new DebugPlugin({ path: '/debug' }));
            app.register(new AsyncApiPlugin({ path: '/asyncapi' }));
            server = await app.listen(0);
            port = server.port;
        });

        afterAll(async () => {
            await app.stop(true);
        });

        test("DebugPlugin /asyncapi/_code blocks path traversal", async () => {
            const res = await fetch(`http://localhost:${server!.port}/debug/asyncapi/_code?file=../package.json`);
            expect(res.status).toBe(403);
        });

        test("DebugPlugin /asyncapi/_code blocks path traversal via cwd prefix", async () => {
            // If cwd is /app, resolve('../appsomething') -> /appsomething which startsWith('/app')
            const res = await fetch(`http://localhost:${server!.port}/debug/asyncapi/_code?file=../${process.cwd().split('/').pop()}foo/bar.txt`);
            expect(res.status).toBe(403);
        });

        test("DebugPlugin /explorer/_source blocks path traversal", async () => {
            const res = await fetch(`http://localhost:${server!.port}/debug/explorer/_source?file=../package.json`);
            expect(res.status).toBe(403);
        });

        test("AsyncApiPlugin /_code blocks path traversal", async () => {
            const res = await fetch(`http://localhost:${server!.port}/asyncapi/_code?file=../package.json`);
            expect(res.status).toBe(403);
        });

        test("DebugPlugin /asyncapi/_code allows valid file", async () => {
            // Should return 404 for a file that doesn't exist but is within cwd
            const res = await fetch(`http://localhost:${server!.port}/debug/asyncapi/_code?file=package.json`);
            // Could be 200 if package.json exists, or 404 if it doesn't
            expect(res.status).not.toBe(403);
        });
    });

    describe("FetchInterceptor.restore cleanup", () => {
        test("clears __isPatched flag after restore", () => {
            FetchInterceptor.restore();
            (FetchInterceptor as any).originalFetch = undefined;

            // Create a fresh fetch
            const mockFetch = async () => new Response("ok");
            global.fetch = mockFetch as any;

            const interceptor = new FetchInterceptor();
            interceptor.patch();

            expect((global.fetch as any).__isPatched).toBe(true);

            FetchInterceptor.restore();

            expect((global.fetch as any).__isPatched).toBeUndefined();
            expect((global.fetch as any).__originalFetch).toBeUndefined();

            // Should be able to create a new interceptor after restore
            (FetchInterceptor as any).originalFetch = undefined;
            const interceptor2 = new FetchInterceptor();
            interceptor2.patch();
            expect((global.fetch as any).__isPatched).toBe(true);

            interceptor2.unpatch();
            FetchInterceptor.restore();
        });
    });

    describe("Dashboard Replay SSRF Protection", () => {
        test("blocks replay to internal addresses", () => {
            const result = Dashboard.validateReplayUrl('http://localhost:8080/secret', '/admin');
            expect(result.error).toContain('internal addresses');
        });

        test("blocks replay with blocked protocol", () => {
            const result = Dashboard.validateReplayUrl('file:///etc/passwd', '/admin');
            expect(result.error).toContain('Invalid protocol');
        });

        test("blocks replay to dashboard path", () => {
            const result = Dashboard.validateReplayUrl('http://example.com/admin/replay', '/admin');
            expect(result.error).toContain('dashboard path');
        });

        test("allows replay to external addresses", () => {
            const result = Dashboard.validateReplayUrl('https://api.example.com/users', '/admin');
            expect(result.error).toBeUndefined();
        });

        test("returns error for invalid URL", () => {
            const result = Dashboard.validateReplayUrl('not-a-url', '/admin');
            expect(result.error).toContain('Invalid URL');
        });
    });

    describe("Plugin detection via metadata", () => {
        test("WebAppPlugin.detectPaths uses metadata.pluginName", async () => {
            const app = new Shokupan({ port: 0 });
            const webApp = new WebAppPlugin({ path: '/_app' });
            const debugPlugin = new DebugPlugin({ path: '/debug' });

            app.register(debugPlugin);
            app.register(webApp);
            await app.listen();

            // Invoke the private method directly to avoid SPA routing issues
            const config = (webApp as any).detectPaths();
            expect(config.asyncApi).toBe('/debug/asyncapi');
            expect(config.apiExplorer).toBe('/debug/explorer');

            await app.stop(true);
        });

        test("Dashboard.detectIntegrations uses metadata.pluginName", async () => {
            const app = new Shokupan({ port: 0 });
            const dashboard = new Dashboard({ path: "/admin" });
            const debugPlugin = new DebugPlugin({ path: '/debug' });

            app.register(debugPlugin);
            app.register(dashboard);
            await app.listen();

            // Invoke the private method directly
            const integrations = (dashboard as any).detectIntegrations();
            expect(integrations.asyncapi).toBe('/debug/asyncapi');
            expect(integrations.apiExplorer).toBe('/debug/explorer');

            await app.stop(true);
        });
    });

    describe("Resource leak prevention", () => {
        test("DebugPlugin onShutdown clears interval and clients", () => {
            const plugin = new DebugPlugin();
            // Simulate an active interval
            (plugin as any).testBroadcastInterval = setInterval(() => {}, 1000);
            (plugin as any).clients = new Set([{ close: () => {} }] as any);

            plugin.onShutdown();

            expect((plugin as any).testBroadcastInterval).toBeNull();
            expect((plugin as any).clients.size).toBe(0);
        });

        test("AsyncApiPlugin onShutdown clears interval and clients", () => {
            const plugin = new AsyncApiPlugin();
            (plugin as any).testBroadcastInterval = setInterval(() => {}, 1000);
            (plugin as any).clients = new Set([{ close: () => {} }] as any);

            plugin.onShutdown();

            expect((plugin as any).testBroadcastInterval).toBeNull();
            expect((plugin as any).clients.size).toBe(0);
        });
    });
});
