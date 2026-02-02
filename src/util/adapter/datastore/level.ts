import type { AbstractLevel } from 'abstract-level';
import { createLogger } from '../../logger';
import type { DatastoreAdapter, QueryOptions } from '../datastore';

export class LevelAdapter implements DatastoreAdapter {
    name = 'leveldb';
    private db: AbstractLevel<any, string, string>;
    private logger = createLogger('level-adapter');

    constructor(
        private options: { location?: string, db?: any; } = {}
    ) {
        if (options.db) {
            this.db = options.db;
        } else {
            // Dynamic import to avoid hard dependency if not used
            // This expects user to have installed classic-level
            // We can't easily dynamically new it without knowing the module name or having it passed.
            // For now, we assume options.db is passed OR we try to require 'classic-level'
            // But usually adapters inject the instance or factory.
            // We'll try to import classic-level if location is provided.
            throw new Error("LevelAdapter requires an initialized AbstractLevel instance in options.db for now, or ensure classic-level is installed.");
        }

        process.on("exit", async () => {
            await this.disconnect();
        });
    }

    async connect(): Promise<void> {
        if (this.db.status === 'opening' || this.db.status === 'open') return;
        await this.db.open();
    }

    async disconnect(): Promise<void> {
        await this.db.close();
    }

    async setupSchema(): Promise<void> {
        // Ensure fresh state for tests that might reuse instances (though we try not to)
        // Ensure fresh state for tests that might reuse instances (though we try not to)
        if (process.env.NODE_ENV !== 'test') this.logger.debug('LevelAdapter', "Clearing DB");
        await this.db.clear();
        if (process.env.NODE_ENV !== 'test') this.logger.debug('LevelAdapter', "DB cleared");
    }

    private getKey(table: string, id: string) {
        return `${table}:${id}`;
    }

    async get<T>(table: string, id: string): Promise<T | null> {
        try {
            const raw = await this.db.get(this.getKey(table, id));
            if (raw === undefined) return null;
            return JSON.parse(raw);
        } catch (e: any) {
            if (e.code === 'LEVEL_NOT_FOUND' || e.notFound) return null;
            throw e;
        }
    }

    async create<T>(table: string, id: string, data: T): Promise<T> {
        const key = this.getKey(table, id);
        try {
            const val = await this.db.get(key);
            if (val !== undefined) {
                this.logger.error('LevelAdapter', `Record ${key} found unexpectedly`);
                throw new Error(`Record ${id} already exists`);
            }
        } catch (e: any) {
            // Check for various not found error codes/flags
            const isNotFound = e.code === 'LEVEL_NOT_FOUND' || e.notFound;
            if (!isNotFound) {
                this.logger.error('LevelAdapter', `Create error for ${key}:`, e);
                throw e;
            }
        }

        await this.db.put(key, JSON.stringify(data));
        return data;
    }

    async update<T>(table: string, id: string, data: Partial<T>): Promise<T> {
        const key = this.getKey(table, id);
        let currentRaw: string | undefined;
        try {
            currentRaw = await this.db.get(key);
        } catch (e: any) {
            if (e.code === 'LEVEL_NOT_FOUND' || e.notFound) {
                throw new Error(`Record ${id} does not exist`);
            }
            throw e;
        }

        if (currentRaw === undefined) throw new Error(`Record ${id} does not exist`);

        const current = JSON.parse(currentRaw);
        const updated = { ...current, ...data };
        await this.db.put(key, JSON.stringify(updated));
        return updated;
    }

    async upsert<T>(table: string, id: string, data: T): Promise<T> {
        const key = this.getKey(table, id);
        // LevelDB put IS upsert basically (overwrite)
        // But if we want merge, we need read first. 
        // Surreal upsert replaces content? Yes.
        await this.db.put(key, JSON.stringify(data));
        return data;
    }

    async delete(table: string, id: string): Promise<void> {
        await this.db.del(this.getKey(table, id));
    }

    async count(table: string, query?: QueryOptions): Promise<number> {
        // Full scan required if internal implementation
        // Optimization: Maintain counters? Too complex for generic adapter.
        // Scan keys for table prefix
        const items = await this.scan(table, query);
        return items.length;
    }

    async deleteMany(table: string, query?: QueryOptions): Promise<void> {
        const items = await this.scan(table, query);
        // Batch delete
        const ops = items.map(item => ({ type: 'del' as const, key: this.getKey(table, (item as any).id || (item as any)._id) }));
        // Wait, we need the ID. 
        // If stored data has ID, good. If not, we need to return keys from scan.
        // Let's make scan return keys?

        // Re-implement scan to return keys+values or just support delete loop.
        // Since we don't have atomic batch delete by query in Level without keys.

        // Let's assume scan returns objects and we rely on ID being in the object (Shokupan convention).
        // Or we parse key.
        // Key format: table:id.

        // Impl:
        for (const item of items) {
            // Extract ID from object or re-scan keys? 
            // Ideally scan should return { key, value }.
            // But existing findMany returns T[].

            // If we really need robust deleteMany, we need scan to return keys.
            // We can iterate generic iterator.
        }

        // Simple generic delete:
        // This is inefficient but functional for small datasets (like failed requests buffer).
        // Better leveldb usage would be separate indexes.

        // Re-scan finding keys
        const keysToDelete: string[] = [];
        for await (const [key, value] of this.db.iterator({ gte: table + ':', lte: table + ':\xFF' })) {
            try {
                const data = JSON.parse(value);
                if (this.matches(data, query)) {
                    keysToDelete.push(key);
                }
            } catch { }
        }

        // Apply limit/sort? 
        // Applying limit/sort on deletions matches logic in other adapters.
        // If sort is needed, we must fetch all matching, sort, slice, then delete.

        if (query?.sort || query?.limit) {
            // We need full objects to sort
            const candidates: { key: string, data: any; }[] = [];
            for (const key of keysToDelete) {
                // We already parsed it above but didn't keep it.
                // Rescan properly:
            }
            // Let's combine logic.
        }

        // Proper implementation:
        let matches: { key: string, data: any; }[] = [];
        for await (const [key, value] of this.db.iterator({ gte: table + ':', lte: table + ':\xFF' })) {
            try {
                const data = JSON.parse(value);
                if (this.matches(data, query)) {
                    matches.push({ key, data });
                }
            } catch { }
        }

        matches = this.applySortLimit(matches, query);

        if (matches.length) {
            await this.db.batch(matches.map(m => ({ type: 'del', key: m.key })));
        }
    }

    async findMany<T>(table: string, query?: QueryOptions): Promise<T[]> {
        let matches: { key: string, data: T; }[] = [];
        for await (const [key, value] of this.db.iterator({ gte: table + ':', lte: table + ':\xFF' })) {
            try {
                const data = JSON.parse(value);
                if (this.matches(data, query)) {
                    matches.push({ key, data });
                }
            } catch { }
        }

        matches = this.applySortLimit(matches, query);
        return matches.map(m => m.data);
    }

    private async scan<T>(table: string, query?: QueryOptions): Promise<T[]> {
        return this.findMany(table, query);
    }

    private matches(data: any, query?: QueryOptions): boolean {
        if (!query) return true;
        if (query.where) {
            for (const [k, v] of Object.entries(query.where)) {
                if (data[k] !== v) return false;
            }
        }
        if (query.lt) {
            for (const [k, v] of Object.entries(query.lt)) {
                if (!(data[k] < (v as any))) return false;
            }
        }
        if (query.gt) {
            for (const [k, v] of Object.entries(query.gt)) {
                if (!(data[k] > (v as any))) return false;
            }
        }
        return true;
    }

    private applySortLimit<T>(items: { key: string, data: T; }[], query?: QueryOptions): { key: string, data: T; }[] {
        if (!query) return items;

        if (query.sort) {
            items.sort((a, b) => {
                for (const [k, dir] of Object.entries(query.sort!)) {
                    const av = (a.data as any)[k];
                    const bv = (b.data as any)[k];
                    if (av < bv) return dir === 'asc' ? -1 : 1;
                    if (av > bv) return dir === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }

        if (query.offset) {
            items = items.slice(query.offset);
        }

        if (query.limit) {
            items = items.slice(0, query.limit);
        }

        return items;
    }
}
