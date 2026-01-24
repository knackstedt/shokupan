import { bulkhead, circuitBreaker, ConsecutiveBreaker, ConstantBackoff, ExponentialBackoff, fallback, handleAll, retry, timeout, TimeoutStrategy, wrap, type IPolicy } from 'cockatiel';
import type { ResilienceConfig } from './decorators';

export class ResilienceFactory {
    static createPolicy(config: ResilienceConfig): IPolicy {
        const policies: IPolicy[] = [];

        // 5. Retry
        if (config.retry) {
            // handleAll is a PolicyBuilder object in this version
            const builder = handleAll;

            // Basic retry policy configuration
            // Cockatiel maxAttempts treats value as number of RETRIES (additional attempts).
            // So for N total attempts, we pass N-1.
            let retries = (config.retry.attempts ?? 3) - 1;
            if (retries < 0) retries = 0;

            let retryPolicy;
            if (config.retry.backoff === 'exponential') {
                retryPolicy = retry(builder, {
                    maxAttempts: retries,
                    backoff: new ExponentialBackoff({
                        initialDelay: config.retry.delay || 1000,
                        maxDelay: config.retry.maxDelay || 30000
                    })
                });
            } else {
                retryPolicy = retry(builder, {
                    maxAttempts: retries,
                    backoff: new ConstantBackoff(config.retry.delay || 1000)
                });
            }
            policies.push(retryPolicy);
        }

        // 4. CircuitBreaker
        if (config.circuitBreaker) {
            const builder = handleAll;
            const breaker = circuitBreaker(builder, {
                halfOpenAfter: config.circuitBreaker.resetTimeout || 10000,
                breaker: new ConsecutiveBreaker(config.circuitBreaker.threshold || 5),
            });
            policies.push(breaker);
        }

        // 3. Timeout
        if (config.timeout) {
            policies.push(timeout(config.timeout, { strategy: TimeoutStrategy.Aggressive, abortOnReturn: true }));
        }

        // 2. Bulkhead
        if (config.bulkhead) {
            policies.push(bulkhead(config.bulkhead));
        }

        // 1. Fallback
        if (config.fallback !== undefined) {
            const builder = handleAll;
            const fb = fallback(builder, config.fallback);
            policies.push(fb as any);
        }

        // wrap takes arguments from outer to inner.
        // We constructed policies from inner to outer (Retry -> ... -> Fallback)
        // Wait, did we?
        // - Push Retry (Pushed 1st)
        // - Push Breaker (Pushed 2nd)
        // - ...
        // - Push Fallback (Pushed last)

        // policies = [Retry, Breaker, Timeout, Bulkhead, Fallback]

        // We want execution flow: Fallback -> Bulkhead -> Timeout -> Breaker -> Retry -> Function
        // wrap(Fallback, Bulkhead, Timeout, Breaker, Retry).execute()
        // This means Fallback wraps everything else.

        // So we need to reverse the array? NO.
        // policies.reverse() -> [Fallback, Bulkhead, Timeout, Breaker, Retry]
        // This looks correct order for wrap arguments.

        return wrap(...policies.reverse());
    }
}
