import { describe, expect, test } from "bun:test";
import { DebugPlugin } from "../../plugins/application/debug/plugin";
import { AsyncApiPlugin } from "../../plugins/application/asyncapi/plugin";

describe("Security: Resource Leak Prevention", () => {
    test("DebugPlugin onShutdown clears interval and clients", () => {
        const plugin = new DebugPlugin();
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
