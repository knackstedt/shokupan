import { $resilienceConfig } from '../../util/symbol';

export interface RetryOptions {
    attempts?: number;
    backoff?: 'constant' | 'exponential';
    delay?: number;
    maxDelay?: number;
}

export interface CircuitBreakerOptions {
    threshold?: number;
    windowDuration?: number;
    resetTimeout?: number;
}

export interface ResilienceConfig {
    retry?: RetryOptions;
    circuitBreaker?: CircuitBreakerOptions;
    timeout?: number;
    bulkhead?: number;
    fallback?: any | ((...args: any[]) => any);
}

function updateResilienceConfig(target: any, propertyKey: string | symbol, config: Partial<ResilienceConfig>) {
    const existing: Map<string | symbol, ResilienceConfig> = target[$resilienceConfig] || new Map();
    const currentConfig = existing.get(propertyKey) || {};

    // Merge new config
    Object.assign(currentConfig, config);

    existing.set(propertyKey, currentConfig);
    target[$resilienceConfig] = existing;
}

export function Retry(options: RetryOptions = {}) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        updateResilienceConfig(target, propertyKey, { retry: options });
    };
}

export function CircuitBreaker(options: CircuitBreakerOptions = {}) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        updateResilienceConfig(target, propertyKey, { circuitBreaker: options });
    };
}

export function Timeout(duration: number) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        updateResilienceConfig(target, propertyKey, { timeout: duration });
    };
}

export function Bulkhead(limit: number) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        updateResilienceConfig(target, propertyKey, { bulkhead: limit });
    };
}

export function Fallback(valueOrFn: any) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        updateResilienceConfig(target, propertyKey, { fallback: valueOrFn });
    };
}
