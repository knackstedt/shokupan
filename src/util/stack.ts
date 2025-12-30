/**
 * Captures the file and line number of the caller.
 * Use skipFrames to skip helper functions in the stack trace.
 */
export function getCallerInfo(skipFrames = 2): { file: string; line: number } {
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
        // Index 0: Error
        // Index 1: getCallerInfo (this function)
        // Index 2: caller (or whatever calls this)

        // So we scan starting from a reasonable offset

        // However, stack trace format depends on many things. 
        // A more robust way is to just look for the first line that ISN'T internal.

        // Filter out this file itself if possible, but identifying "this file" is tricky without context.
        // So we rely on skipFrames OR we filter known internal files.

        // Standard Bun Stack Line: "at functionName (/path/to/file.ts:123:45)" or "at /path/to/file.ts:123:45"

        let found = 0;
        for (let i = 1; i < stack.length; i++) {
            const l = stack[i];

            // Ignore internals
            if (!l.includes(':')) continue; // likely not File:Line context
            if (l.includes('node_modules')) continue;
            if (l.includes('bun:main')) continue;
            if (l.includes('src/util/stack.ts')) continue; // Ignore self
            if (l.includes('src/router.ts')) continue; // Ignore router internals
            if (l.includes('src/shokupan.ts')) continue; // Ignore framework internals

            found++;
            if (found >= skipFrames) {
                // Parse this line
                const match = l.match(/\((.*):(\d+):(\d+)\)/) || l.match(/at (.*):(\d+):(\d+)/);
                if (match) {
                    file = match[1];
                    // Clean up file path if it has "async " prefix or similar if regex was loose,
                    // but the regex capture group 1 should be the path.
                    // Sometimes match[1] might contain "functionName (/path...)" if the regex matched weirdly,
                    // but the above regexes look for parenthesis wrap or clean "at path".

                    line = parseInt(match[2], 10);
                    return { file, line };
                }
            }
        }

    } catch (e) { }

    return { file, line };
}
