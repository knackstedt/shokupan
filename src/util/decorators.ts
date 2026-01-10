import { RateLimitMiddleware, type RateLimitOptions } from "../plugins/middleware/rate-limit";
import { $controllerPath, $eventMethods, $middleware, $routeArgs, $routeMethods, $routeSpec } from "./symbol";
import type { GuardAPISpec, MethodAPISpec } from "./types";
import { type Method, type Middleware, RouteParamType } from "./types";

/**
 * Class Decorator: Defines the base path for a controller.
 */
export function Controller(path: string = "/") {
    return (target: any) => {
        target[$controllerPath] = path;
    };
}

/**
 * Decorator: Applies middleware to a class or method.
 */
export function Use(...middleware: Middleware[]) {
    return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
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
export function Spec(spec: MethodAPISpec | GuardAPISpec) {
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
                path
            });
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
 * Decorator: Binds a method to the WebSocket event.
 * @param eventName The name of the event to listen for.
 */
export function Event(eventName: string) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        target[$eventMethods] ??= new Map();
        target[$eventMethods].set(propertyKey, {
            eventName
        });
    };
}

/**
 * Decorator: Applies a rate limit to a class or method.
 */
export function RateLimit(options: RateLimitOptions) {
    return Use(RateLimitMiddleware(options));
}
