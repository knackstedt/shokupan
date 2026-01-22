import './metadata'; // Apply polyfill


/**
 * Simple Dependency Injection Container
 */
export class Container {
    private static services = new Map<any, any>();

    public static register<T>(target: new (...args: any[]) => T, instance: T) {
        this.services.set(target, instance);
    }

    public static get<T>(target: new (...args: any[]) => T): T | undefined {
        return this.services.get(target);
    }

    public static has(target: any): boolean {
        return this.services.has(target);
    }

    private static cache = new Map<any, { scope: string, dependencies: any[]; }>();

    private static resolvingStack = new Set<any>();

    public static resolve<T>(target: new (...args: any[]) => T): T {
        // 1. Check if it's a singleton already instantiated
        if (this.services.has(target)) {
            return this.services.get(target);
        }

        // 2. Cycle Detection
        if (this.resolvingStack.has(target)) {
            const cycle = Array.from(this.resolvingStack);
            cycle.push(target);
            throw new Error(`Circular dependency detected: ${cycle.map(t => t.name || t).join(' -> ')}`);
        }
        this.resolvingStack.add(target);

        try {
            // 3. Check metadata cache
            let meta = this.cache.get(target);
            if (!meta) {
                const scope = Reflect.getMetadata('di:scope', target) || 'singleton';
                const paramTypes = Reflect.getMetadata('design:paramtypes', target) || [];
                const manualTokens = Reflect.getMetadata('di:constructor:params', target) || [];

                const dependencies = paramTypes.map((param: any, index: number) => {
                    const manual = manualTokens.find((t: any) => t.index === index);
                    if (manual && manual.token) return manual.token;
                    if (param === String || param === Number || param === Boolean || param === Object || param === undefined) return undefined;
                    return param;
                });

                meta = { scope, dependencies };
                this.cache.set(target, meta);
            }

            // 4. Resolve dependencies from cache
            const args = meta.dependencies.map(dep => dep ? Container.resolve(dep) : undefined);

            // 5. Instantiate
            const instance = new target(...args);

            // 6. Lifecycle: onInit
            if (typeof (instance as any).onInit === 'function') {
                (instance as any).onInit();
            }

            // 7. Store if singleton
            if (meta.scope === 'singleton') {
                this.services.set(target, instance);
            }

            return instance;
        } finally {
            this.resolvingStack.delete(target);
        }
    }

    public static async teardown() {
        for (const [target, instance] of this.services.entries()) {
            if (typeof instance.onDestroy === 'function') {
                await instance.onDestroy();
            }
        }
        this.services.clear();
        this.cache.clear();
    }
}
