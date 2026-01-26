
/**
 * Fast Cookie Parser
 * 
 * Optimized for speed by minimizing allocations and avoiding regex/split.
 */
export function parseCookies(str: string): Record<string, string> {
    const obj: Record<string, string> = Object.create(null);
    if (!str) return obj;

    const len = str.length;
    let index = 0;

    while (index < len) {
        // Find end of current part
        let endIdx = str.indexOf(';', index);
        if (endIdx === -1) endIdx = len;

        // Skip leading spaces for the key
        let keyStart = index;
        while (keyStart < endIdx && str.charCodeAt(keyStart) === 32) keyStart++;

        const eqIdx = str.indexOf('=', keyStart);

        if (eqIdx !== -1 && eqIdx < endIdx) {
            const key = str.slice(keyStart, eqIdx);

            // Value is from eqIdx+1 to endIdx
            // Check trailing spaces
            let valEnd = endIdx;
            while (valEnd > eqIdx + 1 && str.charCodeAt(valEnd - 1) === 32) {
                valEnd--;
            }

            let val = str.slice(eqIdx + 1, valEnd);

            // Decode if needed
            if (val.indexOf('%') !== -1) {
                try { val = decodeURIComponent(val); } catch (e) { }
            }

            obj[key] = val;
        }

        index = endIdx + 1;
    }
    return obj;
}
