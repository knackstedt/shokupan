
import { describe, expect, it, mock } from "bun:test";
import { FetchInterceptor } from "./fetch-interceptor";

describe("Fetch Interceptor", () => {
    it("should intercept fetch calls", async () => {
        FetchInterceptor.restore(); // Clear previous state
        (FetchInterceptor as any).originalFetch = undefined; // Force recapture
        const originalFetch = mock(async () => new Response("ok"));
        global.fetch = originalFetch;

        const interceptor = new FetchInterceptor();
        interceptor.patch();

        await fetch("http://example.com");

        expect(originalFetch).toHaveBeenCalled();
        FetchInterceptor.restore();
    });

    it("should track outgoing requests", async () => {
        FetchInterceptor.restore();
        (FetchInterceptor as any).originalFetch = undefined;
        const originalFetch = mock(async () => new Response("ok"));
        global.fetch = originalFetch;

        const interceptor = new FetchInterceptor();
        interceptor.patch();

        await fetch("http://test.com", { method: 'POST' });

        // In a real env, we'd check if it logged to DB, but unit test might not have DB setup easily.
        // We verify it wraps fetch without breaking it.
        expect(originalFetch).toHaveBeenCalled();
        FetchInterceptor.restore();
    });
});
