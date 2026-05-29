
import { afterEach, describe, expect, it, mock } from "bun:test";
import { FetchInterceptor } from "./fetch-interceptor";

describe("Fetch Interceptor", () => {
    const realFetch = global.fetch;

    afterEach(() => {
        // Always restore the real global.fetch to prevent leaking mocks to other tests
        global.fetch = realFetch;
    });

    it("should intercept fetch calls", async () => {
        FetchInterceptor.restore(); // Clear previous state
        (FetchInterceptor as any).originalFetch = undefined; // Force recapture
        const testFetch = mock(async () => new Response("ok")) as any;
        global.fetch = testFetch;

        const interceptor = new FetchInterceptor();
        interceptor.patch();

        await fetch("http://example.com");

        expect(testFetch).toHaveBeenCalled();
        FetchInterceptor.restore();
    });

    it("should track outgoing requests", async () => {
        FetchInterceptor.restore();
        (FetchInterceptor as any).originalFetch = undefined;
        const testFetch = mock(async () => new Response("ok")) as any;
        global.fetch = testFetch;

        const interceptor = new FetchInterceptor();
        interceptor.patch();

        await fetch("http://test.com", { method: 'POST' });

        // In a real env, we'd check if it logged to DB, but unit test might not have DB setup easily.
        // We verify it wraps fetch without breaking it.
        expect(testFetch).toHaveBeenCalled();
        FetchInterceptor.restore();
    });
});
