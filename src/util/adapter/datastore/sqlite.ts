import type { Database } from 'bun:sqlite';
import { getProcess } from '../../env';
import { createLogger } from '../../logger';
import type { DatastoreAdapter, QueryOptions } from '../datastore';

export class SqliteAdapter implements DatastoreAdapter {
    name = 'sqlite';
    private db!: Database;
    private logger = createLogger();
    private tables = new Set<string>();

    constructor(
        private options: { filename?: string; } = {}
    ) { }

    async connect(): Promise<void> {
        const p = getProcess();
        if (p && p.versions && p.versions.node && !p.versions.bun) {
            throw new Error("SqliteAdapter uses bun:sqlite and is not supported in Node.js. Please use SurrealAdapter or another datastore for Node.js environments.");
        }
        const { Database } = await import('bun:sqlite');
        this.db = new Database(this.options.filename || ':memory:');
        p?.on("exit", async () => {
            if (this.db) this.db.close();
        });
    }

    async disconnect(): Promise<void> {
        if (this.db) this.db.close();
    }

    async setupSchema(): Promise<void> {
        // In SQLite we need to create tables eagerly or lazily. 
        // We'll pre-create standard tables but also ensureTable in methods.
        // For 'schemaless' behavior, we use a single 'data' JSON column.
        // Also 'id' as primary key.
        // We might want created_at/updated_at.

        const tables = [
            'failed_requests', 'sessions', 'users', 'idempotency_keys',
            'middleware_tracking', 'requests', 'metrics', 'idempotency' // 'idempotency' used in plugin.ts but 'idempotency_keys' used elsewhere? Check code. 
            // The plugin code used `new RecordId('idempotency', key)`, so table name is 'idempotency'.
            // The shokupan.ts defined 'idempotency_keys'. 
            // We'll create both or just handle lazily.
        ];

        for (const table of tables) {
            await this.ensureTable(table);
        }
    }

    private ensureTable(table: string) {
        if (this.tables.has(table)) return;

        this.db.run(`CREATE TABLE IF NOT EXISTS "${table}" (
            id TEXT PRIMARY KEY,
            data JSON,
            created_at INTEGER,
            updated_at INTEGER
        )`);

        this.tables.add(table);
    }

    async get<T>(table: string, id: string): Promise<T | null> {
        this.ensureTable(table);
        const stmt = this.db.prepare(`SELECT data FROM "${table}" WHERE id = ?`);
        const res = stmt.get(id) as { data: string; } | null;
        if (!res || !res.data) return null;

        try {
            return JSON.parse(res.data) as T;
        } catch (e) {
            return null;
        }
    }

    async create<T>(table: string, id: string, data: T): Promise<T> {
        this.ensureTable(table);
        const now = Date.now();
        // data usually includes id in Shokupan logic? Or maybe not.
        // We store full object in data, including id if present.
        const serialized = JSON.stringify(data);

        try {
            this.db.run(
                `INSERT INTO "${table}" (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)`,
                [id, serialized, now, now]
            );
            return data;
        } catch (err: any) {
            if (err.message.includes('constraint failed')) {
                // Duplicate
                throw new Error(`Record ${id} already exists`);
            }
            throw err;
        }
    }

    async update<T>(table: string, id: string, data: Partial<T>): Promise<T> {
        this.ensureTable(table);

        // SQLite JSON patch is tricky without json_patch() extension or complex queries.
        // Simplest is Read-Modify-Write for now, as concurrency is single-process-ish with Bun (mostly).
        // Or usage of json_patch in newer SQLite versions (Bun uses recent sqlite).

        // Let's try Read-Modify-Write for safety/simplicity first.
        const current = await this.get<T>(table, id);
        if (!current) throw new Error(`Record ${id} does not exist`);

        const updated = { ...current, ...data };
        const serialized = JSON.stringify(updated);
        const now = Date.now();

        this.db.run(
            `UPDATE "${table}" SET data = ?, updated_at = ? WHERE id = ?`,
            [serialized, now, id]
        );

        return updated;
    }

    async upsert<T>(table: string, id: string, data: T): Promise<T> {
        this.ensureTable(table);
        const now = Date.now();
        const serialized = JSON.stringify(data);

        // SQLite UPSERT syntax
        this.db.run(
            `INSERT INTO "${table}" (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
            [id, serialized, now, now]
        );

        return data;
    }

    async delete(table: string, id: string): Promise<void> {
        this.ensureTable(table);
        this.db.run(`DELETE FROM "${table}" WHERE id = ?`, [id]);
    }

    async count(table: string, query?: QueryOptions): Promise<number> {
        this.ensureTable(table);
        const { sql, params } = this.buildWhere(query);
        const res = this.db.prepare(`SELECT COUNT(*) as count FROM "${table}" ${sql}`).get(...params) as { count: number; };
        return res.count;
    }

    async deleteMany(table: string, query?: QueryOptions): Promise<void> {
        this.ensureTable(table);
        const { sql, params } = this.buildWhere(query);
        // SQLite DELETE with LIMIT/ORDER is a compile-time option `SQLITE_ENABLE_UPDATE_DELETE_LIMIT`.
        // Bun ships with it? Assuming yes, or standard DELETE WHERE works. 
        // If query has LIMIT/ORDER, we have to check support.
        // Safest: SELECT ids -> DELETE by ids if LIMIT/ORDER used?

        if (query?.limit || query?.sort) {
            // Complex delete
            const selectQ = this.buildWhere(query);
            // We need to order/limit the selection of IDs
            let orderSql = '';
            if (query.sort) {
                const parts = Object.entries(query.sort).map(([k, v]) => {
                    return `json_extract(data, '$.${k}') ${v.toUpperCase()}`;
                });
                if (parts.length) orderSql = ' ORDER BY ' + parts.join(', ');
            }
            let limitSql = '';
            if (query.limit) limitSql = ` LIMIT ${query.limit}`;

            const rows = this.db.prepare(`SELECT id FROM "${table}" ${selectQ.sql} ${orderSql} ${limitSql}`).all(...selectQ.params) as { id: string; }[];

            if (rows.length === 0) return;

            const ids = rows.map(r => r.id);
            // Batch delete
            const placeholders = ids.map(() => '?').join(',');
            this.db.run(`DELETE FROM "${table}" WHERE id IN (${placeholders})`, ids);
        } else {
            this.db.run(`DELETE FROM "${table}" ${sql}`, params);
        }
    }

    async findMany<T>(table: string, query?: QueryOptions): Promise<T[]> {
        this.ensureTable(table);
        const { sql, params } = this.buildWhere(query);

        let orderSql = '';
        if (query?.sort) {
            const parts = Object.entries(query.sort).map(([k, v]) => {
                // Extract from JSON
                return `json_extract(data, '$.${k}') ${v.toUpperCase()}`;
            });
            if (parts.length) orderSql = ' ORDER BY ' + parts.join(', ');
        }

        let limitSql = '';
        if (query?.limit) limitSql = ` LIMIT ${query.limit}`;
        if (query?.offset) limitSql += ` OFFSET ${query.offset}`;

        const rows = this.db.prepare(`SELECT data FROM "${table}" ${sql} ${orderSql} ${limitSql}`).all(...params) as { data: string; }[];
        return rows.map(r => JSON.parse(r.data));
    }

    private buildWhere(query?: QueryOptions): { sql: string, params: any[]; } {
        if (!query) return { sql: '', params: [] };

        let clauses: string[] = [];
        let params: any[] = [];

        if (query.where) {
            Object.entries(query.where).forEach(([k, v]) => {
                clauses.push(`json_extract(data, '$.${k}') = ?`);
                params.push(v);
            });
        }

        if (query.gt) {
            Object.entries(query.gt).forEach(([k, v]) => {
                clauses.push(`json_extract(data, '$.${k}') > ?`);
                params.push(v);
            });
        }

        if (query.lt) {
            Object.entries(query.lt).forEach(([k, v]) => {
                clauses.push(`json_extract(data, '$.${k}') < ?`);
                params.push(v);
            });
        }

        if (clauses.length === 0) return { sql: '', params: [] };
        return { sql: 'WHERE ' + clauses.join(' AND '), params };
    }
}
