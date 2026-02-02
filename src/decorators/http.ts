import { $controllerPath, $routeArgs, $routeMethods } from "../util/symbol";
import { RouteParamType, type Method } from '../util/types';
import { getCallerInfo } from './util/stack';

/**
 * Class Decorator: Defines the base path for a controller.
 */
export function Controller(path: string = "/") {
    return (target: any) => {
        target[$controllerPath] = path;
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

