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
            // TODO: The following checks are highly fragile and will not work when packaged.
            if (l.includes('src/decorators/stack.ts')) continue; // Ignore self
            if (l.includes('src/router.ts')) continue; // Ignore router internals
            if (l.includes('src/decorators/http.ts')) continue; // Ignore decorators
            if (l.includes('src/shokupan.ts')) continue; // Ignore framework internals
            if (l.includes('src/plugins/application/openapi/openapi.ts')) continue; // Ignore openapi internals

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
