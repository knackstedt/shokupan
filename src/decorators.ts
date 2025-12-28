import { $controllerPath, $middleware, $routeArgs, $routeMethods, $routeSpec } from "./symbol";
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

export const Body = createParamDecorator(RouteParamType.BODY);
export const Param = createParamDecorator(RouteParamType.PARAM);
export const Query = createParamDecorator(RouteParamType.QUERY);
export const Headers = createParamDecorator(RouteParamType.HEADER);
export const Req = createParamDecorator(RouteParamType.REQUEST);
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

export const Get = createMethodDecorator("GET");
export const Post = createMethodDecorator("POST");
export const Put = createMethodDecorator("PUT");
export const Delete = createMethodDecorator("DELETE");
export const Patch = createMethodDecorator("PATCH");
export const Options = createMethodDecorator("OPTIONS");
export const Head = createMethodDecorator("HEAD");
export const All = createMethodDecorator("ALL");
