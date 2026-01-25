
import { describe, expect, it } from "bun:test";
import { SystemCpuMonitor } from "./cpu-monitor";

describe("System CPU Monitor", () => {
    it("should initialize (even if OS not available gracefully)", async () => {
        const monitor = new SystemCpuMonitor(100);
        // It's async init, but we can call methods
        monitor.start();
        expect(monitor.getUsage()).toBe(0);
        monitor.stop();
    });

    // Mocking node:os in bun:test is hard as it's a builtin.
    // We rely on the graceful failure or if running in node-compat it works.
});
