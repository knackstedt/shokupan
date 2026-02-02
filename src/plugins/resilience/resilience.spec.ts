import { describe, expect, it } from "bun:test";
import { Controller, Get } from '../../decorators';
import { Shokupan } from "../../shokupan";
import { CircuitBreaker, Fallback, Retry, Timeout } from "./decorators";

describe("Resilience Policies", () => {

    it("should retry failing requests", async () => {
        let attempts = 0;

        @Controller('/retry')
        class RetryController {
            @Get('/')
            @Retry({ attempts: 3, delay: 10 })
            async handle() {
                attempts++;
                if (attempts < 3) throw new Error("Fail");
                return "Success";
            }
        }

        const app = new Shokupan();
        app.mount('/', new RetryController());

        const res = await app.testRequest({ path: '/retry' });
        expect(res.data).toBe("Success");
        expect(attempts).toBe(3);
    });

    it("should open circuit breaker after failures", async () => {
        let attempts = 0;

        @Controller('/cb')
        class CircuitBreakerController {
            @Get('/')
            @Retry({ attempts: 1 }) // Disable retry basically
            @CircuitBreaker({ threshold: 2, resetTimeout: 100 })
            async handle() {
                attempts++;
                throw new Error("Always Fail");
            }
        }

        const app = new Shokupan();
        app.mount('/', new CircuitBreakerController());

        // 1. Fail
        await app.testRequest({ path: '/cb' });
        // 2. Fail -> Open Circuit? (Threshold 2 means 2 consecutive failures)
        await app.testRequest({ path: '/cb' });

        // 3. Should fail fast with circuit breaker error (BrokenCircuitError)
        // Cockatiel throws 'BrokenCircuitError'
        const res = await app.testRequest({ path: '/cb' });

        // Error message might vary depending on how Shokupan handles exceptions
        // But the key is that handler is NOT called
        expect(attempts).toBe(2);
        expect(res.status).toBe(500);
        // expect(res.data).toContain("Circuit is open"); // Depends on error handling
    });

    it("should fallback on failure", async () => {
        @Controller('/fallback')
        class FallbackController {
            @Get('/')
            @Fallback("Fallback Value")
            async handle() {
                throw new Error("Fail");
            }
        }

        const app = new Shokupan();
        app.mount('/', new FallbackController());

        const res = await app.testRequest({ path: '/fallback' });
        expect(res.data).toBe("Fallback Value");
    });

    it("should timeout long requests", async () => {
        @Controller('/timeout')
        class TimeoutController {
            @Get('/')
            @Timeout(50)
            async handle() {
                await new Promise(resolve => setTimeout(resolve, 100));
                return "Too Slow";
            }
        }

        const app = new Shokupan();
        app.mount('/', new TimeoutController());

        const res = await app.testRequest({ path: '/timeout' });
        expect(res.status).toBe(500); // Timeout throws error
    });
});
