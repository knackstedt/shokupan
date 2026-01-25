
import { describe, expect, it } from "bun:test";
import { ResilienceFactory } from "./factory";

describe("Resilience Factory", () => {
    it("should create policy from empty config", async () => {
        const policy = ResilienceFactory.createPolicy({});
        // Wrap returns a policy that executes
        expect(policy).toBeDefined();
        // Should execute without error
        expect(await policy.execute(() => "ok")).toBe("ok");
    });

    it("should configure retry policy", async () => {
        let attempts = 0;
        const config = {
            retry: {
                attempts: 3,
                delay: 1, // fast
                backoff: 'constant' as const
            }
        };
        const policy = ResilienceFactory.createPolicy(config);

        try {
            await policy.execute(() => {
                attempts++;
                throw new Error("Fail");
            });
        } catch { }

        expect(attempts).toBe(3);
    });

    it("should configure exponential backoff", async () => {
        const config = {
            retry: {
                attempts: 2,
                delay: 1,
                backoff: 'exponential' as const
            }
        };
        const policy = ResilienceFactory.createPolicy(config);
        expect(policy).toBeDefined();
    });

    it("should configure fallback", async () => {
        const config = {
            fallback: "fallback value"
        };
        const policy = ResilienceFactory.createPolicy(config);

        const res = await policy.execute(() => { throw new Error("Fail"); });
        expect(res).toBe("fallback value");
    });

    it("should configure circuit breaker", () => {
        const config = {
            circuitBreaker: {
                threshold: 2,
                windowDuration: 1000
            }
        };
        const policy = ResilienceFactory.createPolicy(config);
        expect(policy).toBeDefined();
    });

    it("should configure timeout", () => {
        const config = { timeout: 100 };
        const policy = ResilienceFactory.createPolicy(config);
        expect(policy).toBeDefined();
    });

    it("should configure bulkhead", () => {
        const config = { bulkhead: 2 };
        const policy = ResilienceFactory.createPolicy(config);
        expect(policy).toBeDefined();
    });
});
