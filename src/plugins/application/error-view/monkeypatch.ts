// Safe Monkeypatch - Only increases stack trace limit
let isPatched = false;

declare global {
    interface Error {
        timestamp?: number;
        id?: string;
        scope?: any;
        structuredStack?: NodeJS.CallSite[];
    }
}

export function applyMonkeyPatch() {
    if (isPatched) return;
    isPatched = true;

    // Increase stack Trace limit
    Error.stackTraceLimit = 50;

    // NOTE: We do NOT patch Error.prepareStackTrace as it causes crashes with 
    // libraries like Axios that call Error.captureStackTrace(this) in the constructor.
    // Instead, we rely on string-based stack parsing and manual metadata injection.
}
