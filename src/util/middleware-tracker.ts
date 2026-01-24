
import type { Middleware, ShokupanHandler } from '../util/types';

export class MiddlewareTracker {
    public static wrap(
        handler: Middleware | ShokupanHandler<any>,
        context: { file: string, line: number, name?: string, isBuiltin?: boolean, pluginName?: string; }
    ): any {
        const { file, line, name, isBuiltin, pluginName } = context;
        const handlerName = name || handler.name || 'anonymous';

        // Direct Metadata Attachment (No Layout/Wrapper Overhead)
        // We mutate the handler if possible to avoid creating a closure.
        // If the handler is reused, the last registration's metadata wins.
        try {
            (handler as any).metadata = context;

            // Allow name to be set if configurable
            if (!handler.name || handler.name === 'anonymous') {
                try {
                    Object.defineProperty(handler, 'name', { value: handlerName, configurable: true });
                } catch (e) { }
            }
        } catch (e) {
            // Function might be frozen or non-extensible
            // In this rare case, we might return a lightweight wrapper or proxy,
            // but for now, let's just return it as is or log a warning.
            // A lightweight wrapper using bind might work:
            const wrapped = handler.bind(null);
            (wrapped as any).metadata = context;
            Object.defineProperty(wrapped, 'name', { value: handlerName });
            (wrapped as any).originalHandler = (handler as any).originalHandler || handler;
            return wrapped;
        }

        return handler;
    }
}
