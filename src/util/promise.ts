import { asyncContext, RequestContextStore } from "./async-hooks";

export const kContext = Symbol("kContext");

export interface PatchedPromise extends Promise<any> {
    [kContext]?: {
        store?: RequestContextStore;
        stack: string;
    };
}

let patched = false;

/**
 * Monkeypatches the global Promise constructor to attach the current AsyncLocalStorage store
 * and a snapshot of the stack trace to every new Promise instance.
 * 
 * This enables the application to trace unhandled rejections back to the original request
 * and see where the dangling promise was created.
 */
export function enablePromisePatch() {
    if (patched) return;
    patched = true;

    const OriginalPromise = global.Promise;

    // @ts-ignore
    global.Promise = class PatchedPromise<T> extends OriginalPromise<T> {
        [kContext]: {
            store?: RequestContextStore;
            stack: string;
        };

        constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) {
            // Capture context and stack before calling super (executor runs synchronously)
            const store = asyncContext.getStore();
            const stack = new Error().stack || "No parent stack";

            super(executor);

            this[kContext] = {
                store,
                stack
            };
        }
    } as any; // Cast to any to avoid strict signature compatibility issues with global.Promise

    // Restore static methods that might be lost or need rebinding
    // However, extending OriginalPromise usually handles this for standard methods.
    // If standard static methods (all, race, etc.) create new Promises, they will use our overridden constructor
    // because `this` in static methods refers to the class.

    // We can copy over static properties just in case there are custom ones or if extension doesn't cover everything in this env
    for (const prop of Object.getOwnPropertyNames(OriginalPromise)) {
        if (prop !== 'prototype' && prop !== 'length' && prop !== 'name') {
            // @ts-ignore
            if (typeof OriginalPromise[prop] === 'function') {
                // @ts-ignore
                global.Promise[prop] = OriginalPromise[prop];
            }
        }
    }
}
