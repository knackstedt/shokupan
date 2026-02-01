
import { describe, expect, it } from "bun:test";
import { $resilienceConfig } from '../../util/symbol';
import { Bulkhead, CircuitBreaker, Fallback, Retry, Timeout } from "./decorators";

describe("Resilience Decorators", () => {
    it("should store retry options", () => {
        class Test {
            @Retry({ attempts: 3, delay: 100 })
            method() { }
        }

        const config = (Test.prototype as any)[$resilienceConfig].get('method');
        expect(config.retry).toEqual({ attempts: 3, delay: 100 });
    });

    it("should store circuit breaker options", () => {
        class Test {
            @CircuitBreaker({ threshold: 5 })
            method() { }
        }
        const config = (Test.prototype as any)[$resilienceConfig].get('method');
        expect(config.circuitBreaker).toEqual({ threshold: 5 });
    });

    it("should store timeout options", () => {
        class Test {
            @Timeout(500)
            method() { }
        }
        const config = (Test.prototype as any)[$resilienceConfig].get('method');
        expect(config.timeout).toBe(500);
    });

    it("should store bulkhead options", () => {
        class Test {
            @Bulkhead(10)
            method() { }
        }
        const config = (Test.prototype as any)[$resilienceConfig].get('method');
        expect(config.bulkhead).toBe(10);
    });

    it("should store fallback options", () => {
        class Test {
            @Fallback("default")
            method() { }
        }
        const config = (Test.prototype as any)[$resilienceConfig].get('method');
        expect(config.fallback).toBe("default");
    });
});
