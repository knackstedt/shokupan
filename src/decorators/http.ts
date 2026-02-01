import { RateLimitMiddleware, type RateLimitOptions } from "../plugins/middleware/rate-limit";
import { $controllerHooks, $controllerPath, $mcpPrompts, $mcpResources, $mcpTools, $middleware, $routeArgs, $routeMethods, $routeSpec } from "../util/symbol";
import type { AsyncAPISpec, GuardAPISpec, MethodAPISpec } from "../util/types";
import { type Method, type Middleware, RouteParamType } from "../util/types";
import { Container } from "./di";
import './metadata';
import { getCallerInfo } from "./stack";

/**
 * Class Decorator: Defines the base path for a controller.
 */
export function Controller(path: string = "/") {
    return (target: any) => {
        target[$controllerPath] = path;
    };
}

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

// --- Parameter Decorators ---

function createParamDecorator(type: RouteParamType) {
    return (name?: string) => {
        return (target: any, propertyKey: string, parameterIndex: number) => {
            if (!target[$routeArgs]) {
                target[$routeArgs] = new Map();
            }
            if (!target[$routeArgs].has(propertyKey)) {
                target[$routeArgs].set(propertyKey, []);
            }
            target[$routeArgs].get(propertyKey).push({
                index: parameterIndex,
                type,
                name
            });
        };
    };
}

/**
 * Decorator: Binds a parameter to the request body.
 */
export const Body = createParamDecorator(RouteParamType.BODY);

/**
 * Decorator: Binds a parameter to the request parameters.
 */
export const Param = createParamDecorator(RouteParamType.PARAM);

/**
 * Decorator: Binds a parameter to the request query string.
 */
export const Query = createParamDecorator(RouteParamType.QUERY);

/**
 * Decorator: Binds a parameter to the request headers.
 */
export const Headers = createParamDecorator(RouteParamType.HEADER);

/**
 * Decorator: Binds a parameter to the request object.
 */
export const Req = createParamDecorator(RouteParamType.REQUEST);

/**
 * Decorator: Binds a parameter to the request context.
 */
export const Ctx = createParamDecorator(RouteParamType.CONTEXT);


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
 * Creates a method decorator for a specific HTTP verb.
 */
function createMethodDecorator(method: Method) {
    return (path: string = "/") => {
        return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
            if (!target[$routeMethods]) {
                target[$routeMethods] = new Map();
            }

            target[$routeMethods].set(propertyKey, {
                method,
                path,
                source: getCallerInfo(2)
            });
            if (path.includes('/user')) {
                console.log(`[Decorator] Captured source for ${propertyKey}:`, getCallerInfo());
            }
        };
    };
}

/**
 * Decorator: Binds a method to the GET HTTP verb.
 */
export const Get = createMethodDecorator("GET");

/**
 * Decorator: Binds a method to the POST HTTP verb.
 */
export const Post = createMethodDecorator("POST");

/**
 * Decorator: Binds a method to the PUT HTTP verb.
 */
export const Put = createMethodDecorator("PUT");

/**
 * Decorator: Binds a method to the DELETE HTTP verb.
 */
export const Delete = createMethodDecorator("DELETE");

/**
 * Decorator: Binds a method to the PATCH HTTP verb.
 */
export const Patch = createMethodDecorator("PATCH");

/**
 * Decorator: Binds a method to the OPTIONS HTTP verb.
 */
export const Options = createMethodDecorator("OPTIONS");

/**
 * Decorator: Binds a method to the HEAD HTTP verb.
 */
export const Head = createMethodDecorator("HEAD");

/**
 * Decorator: Binds a method to ANY HTTP verb.
 */
export const All = createMethodDecorator("ALL");


/**
 * Decorator: Applies a rate limit to a class or method.
 */
export function RateLimit(options: RateLimitOptions) {
    return Use(RateLimitMiddleware(options));
}

/**
 * Decorator: Registers a method as an MCP Tool.
 * @param name The name of the tool (defaults to method name if not provided)
 * @param description Optional description
 * @param inputSchema Optional JSON Schema for input arguments
 */
export function Tool(options?: { name?: string; description?: string; inputSchema?: any; }) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        target[$mcpTools] ??= new Map();
        target[$mcpTools].set(propertyKey, {
            name: options?.name,
            description: options?.description,
            inputSchema: options?.inputSchema
        });
    };
}

/**
 * Decorator: Registers a method as an MCP Prompt.
 * @param name The name of the prompt
 * @param description Optional description
 * @param args Optional list of arguments
 */
export function Prompt(options?: { name?: string; description?: string; arguments?: { name: string; description?: string; required?: boolean; }[]; }) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        target[$mcpPrompts] ??= new Map();
        target[$mcpPrompts].set(propertyKey, {
            name: options?.name,
            description: options?.description,
            arguments: options?.arguments
        });
    };
}

/**
 * Decorator: Registers a method as an MCP Resource handler.
 * @param uri The URI pattern for the resource
 * @param name Optional name
 * @param description Optional description
 * @param mimeType Optional MIME type
 */
export function Resource(uri: string, options?: { name?: string; description?: string; mimeType?: string; }) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        target[$mcpResources] ??= new Map();
        target[$mcpResources].set(propertyKey, {
            uri,
            name: options?.name,
            description: options?.description,
            mimeType: options?.mimeType
        });
    };
}

// --- Controller Hooks ---

function createHookDecorator(hookName: string) {
    return () => {
        return (target: any, propertyKey: string) => {
            target[$controllerHooks] ??= new Map();
            if (!target[$controllerHooks].has(hookName)) {
                target[$controllerHooks].set(hookName, []);
            }
            target[$controllerHooks].get(hookName).push(propertyKey);
        };
    };
}

/**
 * Decorator: Hook that runs before a request is processed by the controller handler.
 */
export const OnRequestStart = createHookDecorator('onRequestStart');

/**
 * Decorator: Hook that runs after a request is successfully processed.
 */
export const OnRequestEnd = createHookDecorator('onRequestEnd');

/**
 * Decorator: Hook that runs when an error occurs during request processing.
 */
export const OnRequestError = createHookDecorator('onError');

/**
 * Decorator: Hook that runs when the response starts sending (headers).
 */
export const OnResponseStart = createHookDecorator('onResponseStart');

/**
 * Decorator: Hook that runs after the response has finished sending.
 */
export const OnResponseEnd = createHookDecorator('onResponseEnd');

/**
 * Decorator: Hook that runs before validation.
 */
export const BeforeValidate = createHookDecorator('beforeValidate');

/**
 * Decorator: Hook that runs after validation.
 */
export const AfterValidate = createHookDecorator('afterValidate');
