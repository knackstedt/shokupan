/**
 * Simple object check.
 */
export function isObject(item: any): item is Record<string, any> {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep merge two objects.
 * 
 * - Arrays are concatenated.
 * - Objects are merged recursively.
 * - Primitives are overwritten.
 */
export function deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                deepMerge(target[key], source[key]);
            } else if (Array.isArray(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: [] });
                // Concatenate arrays? Or overwrite? 
                // For OpenAPI, often appending is good (e.g. tags, security). 
                // But for things like 'servers', maybe we want overwrite or union?
                // Let's go with concatenation for now as a safe default for lists like parameters.
                (target as any)[key] = (target as any)[key].concat(source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return deepMerge(target, ...sources);
}
