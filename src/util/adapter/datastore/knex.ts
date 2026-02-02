import type { Knex } from 'knex';
import { createLogger } from '../../logger';
import type { DatastoreAdapter, QueryOptions } from '../datastore';

export interface KnexAdapterOptions extends Knex.Config {
    // Standard Knex config
}

export class KnexAdapter implements DatastoreAdapter {
    name = 'knex';
    private db!: Knex;
    private logger = createLogger('knex-adapter');
    private jsonColumnType = 'json'; // 'json' or 'jsonb'

    constructor(private options: KnexAdapterOptions) { }

    async connect(): Promise<void> {
        const { default: knex } = await import('knex');
        this.db = knex(this.options);

        // Test connection
        try {
            await this.db.raw('SELECT 1');
            this.detectDialectFeatures();
        } catch (e) {
            this.logger.error('KnexAdapter', "Failed to connect to IO SQL database", e);
            throw e;
        }
    }

    private detectDialectFeatures() {
        const client = (this.db.client as any).driverName || (this.db.client as any).dialect;
        if (client === 'pg' || client === 'postgres') {
            this.jsonColumnType = 'jsonb';
        } else {
            this.jsonColumnType = 'json';
        }
    }

    async disconnect(): Promise<void> {
        await this.db.destroy();
    }

    async setupSchema(): Promise<void> {
        // Create standard tables if they don't exist
        const tables = [
            'failed_requests',
            'sessions',
            'users',
            'idempotency',
            'middleware_tracking',
            'requests',
            'metrics'
        ];

        for (const table of tables) {
            await this.ensureTable(table);
        }
    }

    private async ensureTable(table: string) {
        const exists = await this.db.schema.hasTable(table);
        if (!exists) {
            await this.db.schema.createTable(table, (t) => {
                t.string('id').primary();
                if (this.jsonColumnType === 'jsonb') {
                    t.jsonb('data');
                } else {
                    t.json('data');
                }
                // We might want some standard indexes later (e.g. timestamp inside data?)
                // But for generic schemaless, tough to index inside JSON without expressions.
            });
        }
    }

    // Helper to extract JSON field safely based on dialect
    // Note: Knex ref replacement for JSON is handy.
    private jsonRef(field: string): any {
        // SQLite: json_extract(data, '$.field')
        // PG: data->>'field'
        // MySQL: data->>'$.field'

        // This is complex to generalize perfectly.
        // For basic generic usage, let's try to handle common top-level keys.
        const client = (this.db.client as any).driverName || (this.db.client as any).dialect;

        if (client === 'sqlite3' || client === 'sqlite') {
            return this.db.raw(`json_extract(data, '$.${field}')`);
        }
        if (client === 'pg' || client === 'postgres') {
            return this.db.raw(`data->>'${field}'`);
        }
        if (client === 'mysql' || client === 'mysql2') {
            return this.db.raw(`data->>'$.${field}'`);
        }

        // Fallback (might fail)
        return `data->${field}`;
    }

    async get<T>(table: string, id: string): Promise<T | null> {
        // Ensure table check might be skipped for performance in prod? 
        // For now, assume setupSchema cleared it or we fail cleanly.
        try {
            const res = await this.db(table).where('id', id).first();
            if (!res) return null;

            // Check if data is string or object (sqlite returns string for JSON sometimes if not parsed)
            let data = res.data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch { }
            }
            return { ...data, id }; // Ensure ID is part of it
        } catch (e: any) {
            if (e.message?.includes('no such table')) return null;
            throw e;
        }
    }

    async create<T>(table: string, id: string, data: T): Promise<T> {
        await this.ensureTable(table);
        // data usually contains id too, or we merge it.
        const payload = JSON.stringify(data);
        await this.db(table).insert({
            id,
            data: payload
        });
        return data; // Return what was passed
    }

    async update<T>(table: string, id: string, data: Partial<T>): Promise<T> {
        // Read-Modify-Write transaction preferred for JSON merge if DB doesn't support deep merge easily
        // PG has || operator or jsonb_set, SQLite json_patch.
        // Generic approach: Read, Merge JS, Write.

        return await this.db.transaction(async trx => {
            const row = await trx(table).where('id', id).first();
            if (!row) throw new Error(`Record ${id} does not exist`);

            let current = row.data;
            if (typeof current === 'string') current = JSON.parse(current);

            const updated = { ...current, ...data };
            await trx(table).where('id', id).update({
                data: JSON.stringify(updated)
            });
            return updated;
        });
    }

    async upsert<T>(table: string, id: string, data: T): Promise<T> {
        await this.ensureTable(table);
        const payload = JSON.stringify(data);

        // Knex .onConflict().merge() works for standard upserts
        await this.db(table)
            .insert({ id, data: payload })
            .onConflict('id')
            .merge({ data: payload });

        return data;
    }

    async delete(table: string, id: string): Promise<void> {
        try {
            await this.db(table).where('id', id).delete();
        } catch (e: any) {
            if (e.message?.includes('no such table')) return;
            throw e;
        }
    }

    async count(table: string, query?: QueryOptions): Promise<number> {
        try {
            const q = this.applyQuery(this.db(table), query);
            const res = await q.count({ count: '*' }).first();
            // res could be { count: 5 } or { count: '5' }
            return res ? Number(res.count) : 0;
        } catch (e: any) {
            if (e.message?.includes('no such table')) return 0;
            throw e;
        }
    }

    async deleteMany(table: string, query?: QueryOptions): Promise<void> {
        try {
            // delete via subquery or direct delete with where
            const q = this.db(table);
            this.applyFilters(q, query);
            // applyFilters adds WHERE clauses.

            // Sorting/Limit on delete is dialect specific.
            // MySQL/SQLite support DELETE ... ORDER BY ... LIMIT ...
            // PG does not directly (needs CTE).

            // Safe Generic Approach: Select IDs then Delete IDs.
            if (query?.sort || query?.limit) {
                const ids = await this.findManyIDs(table, query);
                if (ids.length > 0) {
                    await this.db(table).whereIn('id', ids).delete();
                }
                return;
            }

            // Direct delete if just filters
            await q.delete();
        } catch (e: any) {
            if (e.message?.includes('no such table')) return;
            throw e;
        }
    }

    private async findManyIDs(table: string, query?: QueryOptions): Promise<string[]> {
        const q = this.db(table).select('id');
        this.applyQuery(q, query);
        const res = await q;
        return res.map((r: any) => r.id);
    }

    async findMany<T>(table: string, query?: QueryOptions): Promise<T[]> {
        try {
            const q = this.db(table).select('*');
            this.applyQuery(q, query);
            const res = await q;
            return res.map((r: any) => {
                let d = r.data;
                if (typeof d === 'string') {
                    try { d = JSON.parse(d); } catch { }
                }
                return { ...d, id: r.id };
            });
        } catch (e: any) {
            if (e.message?.includes('no such table')) return [];
            throw e;
        }
    }

    private applyFilters(q: Knex.QueryBuilder, query?: QueryOptions) {
        if (!query) return;

        if (query.where) {
            for (const [k, v] of Object.entries(query.where)) {
                q.where(this.jsonRef(k), '=', v);
            }
        }
        if (query.lt) {
            for (const [k, v] of Object.entries(query.lt)) {
                q.where(this.jsonRef(k), '<', v);
            }
        }
        if (query.gt) {
            for (const [k, v] of Object.entries(query.gt)) {
                q.where(this.jsonRef(k), '>', v);
            }
        }
    }

    private applyQuery(q: Knex.QueryBuilder, query?: QueryOptions) {
        this.applyFilters(q, query);

        if (query?.sort) {
            for (const [k, v] of Object.entries(query.sort)) {
                q.orderBy(this.jsonRef(k), v);
            }
        }
        if (query?.offset) {
            q.offset(query.offset);
        }
        if (query?.limit) {
            q.limit(query.limit);
        }
        return q;
    }
}
