import { describe, expect, test } from "bun:test";
import { FetchInterceptor } from "../../plugins/application/dashboard/fetch-interceptor";

describe("Security: FetchInterceptor Cleanup", () => {
    test("clears __isPatched flag after restore", () => {
        const realFetch = global.fetch;

        FetchInterceptor.restore();
        (FetchInterceptor as any).originalFetch = undefined;

        const mockFetch = async () => new Response("ok");
        global.fetch = mockFetch as any;

        const interceptor = new FetchInterceptor();
        interceptor.patch();

        expect((global.fetch as any).__isPatched).toBe(true);

        FetchInterceptor.restore();

        expect((global.fetch as any).__isPatched).toBeUndefined();
        expect((global.fetch as any).__originalFetch).toBeUndefined();

        (FetchInterceptor as any).originalFetch = undefined;
        const interceptor2 = new FetchInterceptor();
        interceptor2.patch();
        expect((global.fetch as any).__isPatched).toBe(true);

        interceptor2.unpatch();
        FetchInterceptor.restore();

        // Restore the real global.fetch to prevent leaking the mock to other tests
        global.fetch = realFetch;
    });
});
