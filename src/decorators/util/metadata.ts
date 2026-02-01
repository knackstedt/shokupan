
/**
 * Lightweight Polyfill for Reflect Metadata API.
 * 
 * Replaces the need for 'reflect-metadata' package to reduce bundle size
 * while maintaining compatibility with TypeScript's emitDecoratorMetadata.
 */

const metadataStore = new WeakMap<any, Map<string | symbol, any>>();

export function defineMetadata(key: string | symbol, value: any, target: any, propertyKey?: string | symbol) {
    let targetMetadata = metadataStore.get(target);
    if (!targetMetadata) {
        targetMetadata = new Map();
        metadataStore.set(target, targetMetadata);
    }

    // Composite key for property metadata: "propertyKey:metadataKey"
    const storageKey = propertyKey ? `${String(propertyKey)}:${String(key)}` : key;
    targetMetadata.set(storageKey, value);
}

export function getMetadata(key: string | symbol, target: any, propertyKey?: string | symbol): any {
    const targetMetadata = metadataStore.get(target);
    if (!targetMetadata) return undefined;

    const storageKey = propertyKey ? `${String(propertyKey)}:${String(key)}` : key;
    return targetMetadata.get(storageKey);
}

// Polyfill global Reflect object
if (typeof Reflect === "object") {
    if (!(Reflect as any).defineMetadata) {
        (Reflect as any).defineMetadata = defineMetadata;
    }
    if (!(Reflect as any).getMetadata) {
        (Reflect as any).getMetadata = getMetadata;
    }
    if (!(Reflect as any).metadata) {
        (Reflect as any).metadata = function (metadataKey: any, metadataValue: any) {
            return function decorator(target: any, propertyKey?: string | symbol) {
                defineMetadata(metadataKey, metadataValue, target, propertyKey);
            };
        };
    }
}

declare global {
    namespace Reflect {
        function defineMetadata(metadataKey: any, metadataValue: any, target: Object, propertyKey?: string | symbol): void;
        function getMetadata(metadataKey: any, target: Object, propertyKey?: string | symbol): any;
        function metadata(metadataKey: any, metadataValue: any): {
            (target: Function): void;
            (target: Object, propertyKey: string | symbol): void;
        };
    }
}
