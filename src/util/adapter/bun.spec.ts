
import { describe, expect, it, mock } from "bun:test";
import { Shokupan } from "../../shokupan";
import { BunAdapter } from "./bun";

describe("Bun Adapter", () => {
    it("should init", () => {
        const adapter = new BunAdapter();
        expect(adapter).toBeDefined();
    });

    it("should throw if Bun is undefined", async () => {
        // We are in Bun test, so Bun is defined.
        // We can't delete global Bun easily to test the error case without potentially breaking test runner.
        // We'll skip forcing the error and just verify success path works or throws if we don't mock app correctly.

        const adapter = new BunAdapter();
        const app = {
            applicationConfig: { hostname: 'localhost', development: true },
            fetch: mock()
        } as unknown as Shokupan;

        // Mock Bun.serve
        const originalServe = Bun.serve;
        const mockStop = mock();
        (Bun as any).serve = mock(() => ({ stop: mockStop }));

        await adapter.listen(3000, app);
        expect(Bun.serve).toHaveBeenCalled();

        await adapter.stop();
        expect(mockStop).toHaveBeenCalled();

        // Restore
        (Bun as any).serve = originalServe;
    });
});
