import { Injectable } from '../../../src/decorators';

@Injectable('singleton')
export class CacheService {
    private cache = new Map<string, { value: any; expires: number }>();

    set(key: string, value: any, ttlMs: number = 60000) {
        this.cache.set(key, { value, expires: Date.now() + ttlMs });
    }

    get(key: string) {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.value;
    }

    delete(key: string) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    keys() {
        return Array.from(this.cache.keys());
    }

    size() {
        return this.cache.size;
    }
}
