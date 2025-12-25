
import { trace, type Tracer } from "@opentelemetry/api";
import { AsyncLocalStorage } from "node:async_hooks";

export const asyncContext = new AsyncLocalStorage<Map<string, any>>();

export function getTracer(name = "convect"): Tracer {
    return trace.getTracer(name);
}

export function runInContext<T>(callback: () => T, initialStore = new Map<string, any>()): T {
    return asyncContext.run(initialStore, callback);
}
