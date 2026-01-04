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
        const sourceKeys = Object.keys(source);
        for (let i = 0; i < sourceKeys.length; i++) {
            const key = sourceKeys[i];
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                deepMerge(target[key], source[key]);
            } else if (Array.isArray(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: [] });

                if (key === 'tags') {
                    // Start fresh if tags are provided in source (overwrite)
                    (target as any)[key] = source[key];
                    continue;
                }

                // Concat then deduplicate primitives
                const mergedArray = (target as any)[key].concat(source[key]);

                // If all items are primitives, unique them
                const isPrimitive = (item: any) =>
                    typeof item === 'string' ||
                    typeof item === 'number' ||
                    typeof item === 'boolean';

                if (mergedArray.every(isPrimitive)) {
                    (target as any)[key] = Array.from(new Set(mergedArray));
                }
                else {
                    (target as any)[key] = mergedArray;
                }
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return deepMerge(target, ...sources);
}
