import { describe, expect, test } from "bun:test";
import { AsyncApiPlugin } from "../../plugins/application/asyncapi/plugin";
import { DebugPlugin } from "../../plugins/application/debug/plugin";

describe("Security: Plugin Permissions", () => {
    describe("DebugPlugin.checkPermission", () => {
        test("allows access when no permissions configured", async () => {
            const plugin = new DebugPlugin({ apiExplorer: { enabled: true } });
            const ctx = { user: null } as any;
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
});
