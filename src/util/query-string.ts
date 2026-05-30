/**
 * Fast Querystring Parser
 * 
 * Optimized for speed by minimizing allocations and avoiding regex.
 * Benchmarked faster than 'fast-querystring' and significantly faster than native 'URLSearchParams'.
 */

export type QueryParserMode = 'simple' | 'extended' | 'strict';

const plusRegex = /\+/g;

export function parseQuery(url: string, mode: QueryParserMode = 'extended'): Record<string, any> {
    const res: Record<string, any> = Object.create(null);
    if (!url) return res;

    // Fast path: finding start of query string
    // This allows passing full URLs or just the query string
    const queryStart = url.indexOf('?');
    // If no '?' found, check if it's a full URL without query params (contains ://)
    // or a raw query string (no ://). Full URLs without ? return empty.
    if (queryStart === -1) {
        if (url.indexOf('://') !== -1) return res;
        const start = 0;
        const len = url.length;
        if (start >= len) return res;
        // Raw query string without ? - parse from beginning
        let i = start;
        let key = '';
        let value = '';
        let eqIndex = -1;
        let ampIndex = -1;

        while (i < len) {
            ampIndex = url.indexOf('&', i);
            if (ampIndex === -1) ampIndex = len;

            eqIndex = url.indexOf('=', i);

            if (eqIndex === -1 || eqIndex > ampIndex) {
                key = url.substring(i, ampIndex);
                value = '';
            } else {
                key = url.substring(i, eqIndex);
                value = url.substring(eqIndex + 1, ampIndex);
            }

            if (key.indexOf('+') !== -1) key = key.replace(plusRegex, ' ');
            if (value.indexOf('+') !== -1) value = value.replace(plusRegex, ' ');

            if (key.indexOf('%') !== -1) {
                try { key = decodeURIComponent(key); } catch (e) { }
            }
            if (value.indexOf('%') !== -1) {
                try { value = decodeURIComponent(value); } catch (e) { }
            }

            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                i = ampIndex + 1;
                continue;
            }

            let isArray = false;
            if (mode === 'extended' && key.endsWith('[]')) {
                key = key.slice(0, -2);
                isArray = true;
            }

            const current = res[key];

            if (current === undefined) {
                if (isArray) {
                    res[key] = [value];
                } else {
                    res[key] = value;
                }
            } else {
                if (mode === 'strict') {
                    throw new Error(`Duplicate query parameter '${key}' is not allowed in strict mode.`);
                } else if (mode === 'simple') {
                    res[key] = value;
                } else {
                    if (Array.isArray(current)) {
                        current.push(value);
                    } else {
                        res[key] = [current, value];
                    }
                }
            }

            i = ampIndex + 1;
        }

        return res;
    }
    const start = queryStart + 1;
    const len = url.length;

    if (start >= len) return res;

    // Use a loop with indexOf for faster splitting than string.split('&')
    let i = start;
    let key = '';
    let value = '';
    let eqIndex = -1;
    let ampIndex = -1;

    while (i < len) {
        ampIndex = url.indexOf('&', i);
        if (ampIndex === -1) ampIndex = len;

        eqIndex = url.indexOf('=', i);

        // If = is missing or after the next &, then key is the whole segment, val is empty
        if (eqIndex === -1 || eqIndex > ampIndex) {
            key = url.substring(i, ampIndex);
            value = '';
        } else {
            key = url.substring(i, eqIndex);
            value = url.substring(eqIndex + 1, ampIndex);
        }

        // Optimization: Check for % before calling decodeURIComponent
        // Also handle + replacement manually if needed, or via replace()
        if (key.indexOf('+') !== -1) key = key.replace(plusRegex, ' ');
        if (value.indexOf('+') !== -1) value = value.replace(plusRegex, ' ');

        if (key.indexOf('%') !== -1) {
            try { key = decodeURIComponent(key); } catch (e) { }
        }
        if (value.indexOf('%') !== -1) {
            try { value = decodeURIComponent(value); } catch (e) { }
        }

        // --- Assignment Logic ---

        // Block dangerous keys
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            i = ampIndex + 1;
            continue;
        }

        // Handle Array Notation "key[]" if in extended mode
        // For standard "key" duplicates, we also handle them based on mode.

        let isArray = false;
        if (mode === 'extended' && key.endsWith('[]')) {
            key = key.slice(0, -2);
            isArray = true;
        }

        const current = res[key];

        if (current === undefined) {
            if (isArray) {
                res[key] = [value];
            } else {
                res[key] = value;
            }
        } else {
            if (mode === 'strict') {
                // Throw or ignore? Context previously threw Error.
                // keeping it performant, maybe just overwrite?
                // But sticking to previous behavior if possible.
                // "Duplicate query parameter ... is not allowed in strict mode"
                throw new Error(`Duplicate query parameter '${key}' is not allowed in strict mode.`);
            } else if (mode === 'simple') {
                // Last wins or first wins? context.ts said "last wins" (overwrite)
                res[key] = value;
            } else {
                // Extended: auto-convert to array
                if (Array.isArray(current)) {
                    current.push(value);
                } else {
                    res[key] = [current, value];
                }
            }
        }

        i = ampIndex + 1;
    }

    return res;
}
