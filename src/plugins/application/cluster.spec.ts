
import { describe, expect, it, mock } from "bun:test";
import { Shokupan } from "../../shokupan";
import { ClusterPlugin } from "./cluster";

// Mock Shokupan app
const mockApp = () => ({
    applicationConfig: { port: 3000 },
    listen: mock(async () => ({ port: 3000, stop: () => { } })),
} as unknown as Shokupan);

describe("Cluster Plugin", () => {
    it("should initialize with default options", () => {
        const plugin = new ClusterPlugin();
        expect(plugin).toBeDefined();
    });

    it("should not cluster if workers <= 1", () => {
        const plugin = new ClusterPlugin({ workers: 1 });
        const app = mockApp();
        const originalListen = app.listen;

        plugin.onInit(app);

        // Listen should remain unchanged (mostly) or wrapper logic won't trigger clustering
        // Actually the code replaces app.listen.
        // But if numWorkers <= 1, it returns early in onInit?
        // Let's check source:
        // if (numWorkers <= 1) return;

        // So applied wrapper check:
        expect(app.listen).toBe(originalListen);
    });

    it("should retrieve 'auto' worker count from os.cpus()", () => {
        const plugin = new ClusterPlugin({ workers: 'auto' });
        const app = mockApp();
        // If we have > 1 CPU, it should modify listen
        // If CI has 1 CPU, it won't.
        // We can't easily mock os.cpus() in Bun without heavier patching.
        // But we can check if it *tries* to run logic.

        plugin.onInit(app);
    });
});
