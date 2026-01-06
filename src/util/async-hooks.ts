
import { AsyncLocalStorage } from "node:async_hooks";


import type { Span } from "@opentelemetry/api";

export class RequestContextStore {
    request?: Request;
    span?: Span;
    [key: string]: any;
}

export const asyncContext = new AsyncLocalStorage<RequestContextStore>();

export function runInContext<T>(callback: () => T, initialStore = new RequestContextStore()): T {
    return asyncContext.run(initialStore, callback);
}
