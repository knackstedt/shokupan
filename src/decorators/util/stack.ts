/**
 * Captures the file and line number of the caller.
 * Use skipFrames to skip helper functions in the stack trace.
 */
export function getCallerInfo(skipFrames = 1): { file: string; line: number; } {
    let file = 'unknown';
    let line = 0;

    try {
        const err = new Error();
        const stack = err.stack?.split('\n') || [];
        // Skip Error line and requested frames
        // Bun stack traces usually look like:
        // Error
        //  at getCallerInfo (...)
        //  at callingFunction (...)
        //
        // Standard Bun Stack Line: "at functionName (/path/to/file.ts:123:45)" or "at /path/to/file.ts:123:45"

        let found = 0;
        for (let i = 1; i < stack.length; i++) {
            const l = stack[i];

            // Ignore internals - These should NEVER be returned as caller info
            if (!l.includes(':')) continue; // likely not File:Line context
            if (l.includes('node_modules')) continue;
            if (l.includes('bun:main')) continue;
            if (l.includes('bun:wrap')) continue;
            // Ignore framework internals by basename (works when packaged too)
            if (/[/\\]stack\.(ts|js|mjs|cts|cjs)/.test(l)) continue; // Ignore self
            if (/[/\\]router\.(ts|js|mjs|cts|cjs)/.test(l)) continue; // Ignore router internals
            if (/[/\\]http\.(ts|js|mjs|cts|cjs)/.test(l)) continue; // Ignore decorators
            if (/[/\\]shokupan\.(ts|js|mjs|cts|cjs)/.test(l)) continue; // Ignore framework internals
            if (/[/\\]openapi\.(ts|js|mjs|cts|cjs)/.test(l)) continue; // Ignore openapi internals

            found++;
            if (found >= skipFrames) {
                // Parse this line
                const match = l.match(/\((.*):(\d+):(\d+)\)/) || l.match(/at (.*):(\d+):(\d+)/);
                if (match) {
                    file = match[1];
                    line = parseInt(match[2], 10);
                    return { file, line };
                }
            }
        }

    } catch (e) { }

    return { file, line };
}
