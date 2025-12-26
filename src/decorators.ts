
import { $routeMethods } from "./symbol";
import type { Method } from "./types";

/**
 * Creates a method decorator for a specific HTTP verb.
 * @param method HTTP Method
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
