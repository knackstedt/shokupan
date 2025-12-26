
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

    public static resolve<T>(target: new (...args: any[]) => T): T {
        if (this.services.has(target)) {
            return this.services.get(target);
        }

        // Auto-instantiate if possible (transient)
        // Note: For full DI we would read constructor params here using 'design:paramtypes'
        // But Bun/Esbuild need distinct config for that.
        // For now, we assume simple instantiation or manual registration.
        const instance = new target();
        this.services.set(target, instance);
        return instance;
    }
}

/**
 * Decorator to mark a class as injectable (Service).
 */
export function Injectable() {
    return (target: any) => {
        // Just a marker for now, or could auto-register
    };
}

/**
 * Property Decorator: Injects a service.
 */
export function Inject(token: any) {
    return (target: any, key: string) => {
        Object.defineProperty(target, key, {
            get: () => Container.resolve(token),
            enumerable: true,
            configurable: true
        });
    };
}
