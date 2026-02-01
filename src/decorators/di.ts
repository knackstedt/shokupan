import { RateLimitMiddleware, type RateLimitOptions } from "../plugins/middleware/rate-limit";
import { $middleware, $routeArgs, $routeSpec } from "../util/symbol";
import type { AsyncAPISpec, GuardAPISpec, MethodAPISpec } from "../util/types";
import { type Middleware, RouteParamType } from "../util/types";
import { Container } from "./util/container";
import './util/metadata';



/**
 * Registers this class as a **Singleton** service.
 * A single instance will be created and shared across the process.
 */
export function Injectable(scope: 'singleton'): ClassDecorator;

/**
 * Registers this class as an **Instanced** (Transient) service.
 * A new instance will be created every time dependency is resolved.
 */
export function Injectable(scope: 'instanced'): ClassDecorator;

/**
 * Registers this class as a Service (defaults to Singleton).
 */
export function Injectable(scope: 'singleton' | 'instanced' = 'singleton'): ClassDecorator {
    return (target: any) => {
        Reflect.defineMetadata('di:scope', scope, target);
    };
}

/**
 * Property/Parameter Decorator: Injects a service.
 * Used on class properties or constructor parameters.
 */
export function Inject(token: any): PropertyDecorator & ParameterDecorator {
    return (target: any, propertyKey: string | symbol | undefined, indexOrDescriptor?: number | PropertyDescriptor) => {
        // Property Decorator
        if (typeof indexOrDescriptor === 'undefined' || (typeof indexOrDescriptor === 'object' && indexOrDescriptor !== null)) {
            const key = String(propertyKey);
            Object.defineProperty(target, key, {
                get: () => Container.resolve(token),
                enumerable: true,
                configurable: true
            });
            return;
        }

        // Parameter Decorator (Constructor only typically supported via Metadata, purely adding metadata here)
        if (typeof indexOrDescriptor === 'number') {
            const index = indexOrDescriptor;
            // target is Constructor
            const existing = Reflect.getMetadata('di:constructor:params', target) || [];
            existing.push({ index, token });
            Reflect.defineMetadata('di:constructor:params', existing, target);
        }
    };
}

/**
 * Decorator: Applies middleware OR injects dependencies.
 * - Class/Method: Middleware
 * - Property/Parameter: Dependency Injection
 */
export function Use(tokenOrMiddleware?: any | Middleware, ...moreMiddleware: Middleware[]) {
    return (target: any, propertyKey?: string, indexOrDescriptor?: PropertyDescriptor | number) => {
        // 1. Parameter Decorator (DI)
        if (typeof indexOrDescriptor === 'number') {
            const index = indexOrDescriptor;
            if (!propertyKey) {
                // Constructor parameter injection
                let token = tokenOrMiddleware;
                // target is the Constructor for constructor parameters

                // If token is missing, try to infer? 
                // Constructor params 'design:paramtypes' are on the class (target).
                if (!token) {
                    const paramTypes = Reflect.getMetadata("design:paramtypes", target);
                    if (paramTypes && paramTypes[index]) {
                        token = paramTypes[index];
                    }
                }

                const existing = Reflect.getMetadata('di:constructor:params', target) || [];
                existing.push({ index, token });
                Reflect.defineMetadata('di:constructor:params', existing, target);
                return;
            }
            // Method parameter
            if (!target[$routeArgs]) target[$routeArgs] = new Map();
            if (!target[$routeArgs].has(propertyKey)) target[$routeArgs].set(propertyKey, []);

            // If token is not provided (null/undefined), infer from design:paramtypes
            // But decorators run before we can really check? 
            // In TS, we can get param types:
            let token = tokenOrMiddleware;
            if (!token) {
                const paramTypes = Reflect.getMetadata("design:paramtypes", target, propertyKey);
                if (paramTypes && paramTypes[index]) {
                    token = paramTypes[index];
                }
            }

            target[$routeArgs].get(propertyKey).push({
                index: index,
                type: RouteParamType.SERVICE,
                token: token
            });
            return;
        }

        // 2. Property Decorator (DI)
        // If propertyKey is defined and descriptor is undefined (or null) - Standard property decorator logic
        // But TS is tricky. 
        if (typeof propertyKey === 'string' && indexOrDescriptor === undefined) {
            let token = tokenOrMiddleware;
            // Try to infer type
            if (!token) {
                token = Reflect.getMetadata("design:type", target, propertyKey);
            }

            // We need to lazy resolve because Container might not be fully populated yet?
            // Or just use a getter.
            Object.defineProperty(target, propertyKey, {
                get: () => {
                    // Circular dep check?
                    if (!token) throw new Error(`Cannot resolve dependency for ${target.constructor.name}.${propertyKey} - no token provided and types unavailable.`);
                    return Container.resolve(token);
                    // Actually `Container` is in `di.ts`. Decorators imports symbols.
                    // We can import Container here if we are careful.
                },
                enumerable: true,
                configurable: true
            });
            // Wait, modifying the prototype getter is one way.
            // But existing `Use` implementation for middleware didn't do this.
            // Let's defer Container import or rely on global?
            // Since `decorators.ts` is util, `di.ts` is util.
            // Let's implement property injection logic cleanly.
            return;
        }


        // 3. Class/Method Decorator (Middleware)
        // Fallback to original middleware logic
        const middleware = [tokenOrMiddleware, ...moreMiddleware];

        // If propertyKey is undefined, it's a class decorator
        if (!propertyKey) {
            const existing = target[$middleware] || [];
            target[$middleware] = [...existing, ...middleware];
        }
        // Method decorator
        else {
            if (!target[$middleware]) {
                target[$middleware] = new Map();
            }
            const existing = target[$middleware].get(propertyKey) || [];
            target[$middleware].set(propertyKey, [...existing, ...middleware]);
        }
    };
}

/**
 * Decorator: Overrides the OpenAPI specification for a route.
 */
export function Spec(spec: MethodAPISpec | GuardAPISpec | AsyncAPISpec) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        if (!target[$routeSpec]) {
            target[$routeSpec] = new Map();
        }
        target[$routeSpec].set(propertyKey, spec);
    };
}

/**
 * Decorator: Applies a rate limit to a class or method.
 */
export function RateLimit(options: RateLimitOptions) {
    return Use(RateLimitMiddleware(options));
}

