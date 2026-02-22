import { $controllerHooks } from '../util/symbol';

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

/**
 * Decorator: Hook that runs when the server is stopped.
 */
export const OnStop = createHookDecorator('onStop');
