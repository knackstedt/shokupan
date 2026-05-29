/**
 * Environment-detection utilities for safe cross-runtime access.
 *
 * Use these helpers instead of directly touching `process` so that code
 * can run in browsers, edge workers, or other non-Node environments
 * without throwing at load time.
 */

/** Return the global `process` object if it exists, otherwise `undefined`. */
export function getProcess(): NodeJS.Process | undefined {
    return typeof process !== 'undefined' ? process : undefined;
}

/** Read a value from `process.env` safely. Returns `undefined` when `process` is missing. */
export function getProcessEnv(key: string): string | undefined {
    const p = getProcess();
    return p?.env?.[key];
}

/** True when running in a Node.js/Bun-like environment where `process` is defined. */
export function isNode(): boolean {
    return typeof process !== 'undefined';
}
