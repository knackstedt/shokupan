import { RecordId, Surreal } from 'surrealdb';
import { createLogger } from '../../logger';
import type { DatastoreAdapter, QueryOptions } from '../datastore';

export interface SurrealAdapterOptions {
    url?: string;
    namespace?: string;
    database?: string;
    auth?: any;
    engines?: any;
    connectOptions?: any;
}

export class SurrealAdapter implements DatastoreAdapter {
    name = 'surrealdb';
    private db: Surreal;
    private logger = createLogger('surreal-adapter');
    private options: SurrealAdapterOptions;

    constructor(options: SurrealAdapterOptions = {}) {
        this.options = options;
        if (options.engines) {
            this.db = new Surreal({ engines: options.engines });
        } else {
            this.db = new Surreal();
        }

        process.on("exit", async () => {
            await this.disconnect();
        });
    }

    async connect(): Promise<void> {
        let url = this.options.url;
        if (!url) {
            // Default behavior equivalent to old initDatastore
            if (process.env.NODE_ENV === 'test') {
                url = 'mem://';
            } else {
                url = 'surrealkv://database';
            }
        }

        if (!this.options.engines && !url.match(/^(?:wss?|https?):\/\//)) {
            try {
                const mod = await import('@surrealdb/node');
                this.db = new Surreal({ engines: mod.createNodeEngines() });
            } catch (e) {
                this.logger.warn('SurrealAdapter', "Could not load @surrealdb/node engines. Embedded protocols might fail.", { error: e });
            }
        }

        await this.db.connect(url, this.options.connectOptions);

        await this.db.use({
            namespace: this.options.namespace ?? "vendor",
            database: this.options.database ?? "shokupan"
        });
    }

    async disconnect(): Promise<void> {
        await this.db.close();
    }

    async setupSchema(): Promise<void> {
        // Equivalent to old createSchema but generic tables if dynamic?
        // Old code had hardcoded table defines. We should keep them for now or rely on "SCHEMALESS" 
        // SurrealDB is schemaless by default but defines help with performance/structure.
        // We'll reimplement the base defines.

        await this.db.query(`
            DEFINE TABLE OVERWRITE failed_requests SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE sessions SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE users SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE idempotency_keys SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE middleware_tracking SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE requests SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE metrics SCHEMALESS COMMENT "Created by Shokupan";
        `);
    }

    private retry<T>(fn: () => Promise<T>): Promise<T> {
        return fn().catch(err => {
            if (err?.message?.includes('This transaction can be retried')) {
                return fn();
            }
            throw err;
        });
    }

    async get<T>(table: string, id: string): Promise<T | null> {
        try {
            const result = await this.db.select<T>(new RecordId(table, id));
            // SurrealDB select typically returns the object, or throws if connection fails.
            // If ID not found, it might return undefined or null or error depending on version.
            // Recent JS SDK: select returns T (single) or T[] (if variable).
            // But if it returns undefined/null, we return null.
            if (Array.isArray(result)) return result[0] || null;
            return result as T || null;
        } catch (error) {
            // If it throws because of not found (some older versions), return null.
            // Or log real error? generic get should probably return null if not found.
            return null;
        }
    }

    async create<T>(table: string, id: string, data: T): Promise<T> {
        return this.retry(() => this.db.create(new RecordId(table, id)).content(data as any)) as any;
    }

    async update<T>(table: string, id: string, data: Partial<T>): Promise<T> {
        return this.retry(() => this.db.update(new RecordId(table, id)).merge(data as any)) as any;
    }

    async upsert<T>(table: string, id: string, data: T): Promise<T> {
        // SurrealDB .upsert() replaces content. If we want merge-like upsert behavior we might need logic,
        // but typically upsert means "insert or replace".
        return this.retry(() => this.db.upsert(new RecordId(table, id)).content(data as any)) as any;
    }

    async delete(table: string, id: string): Promise<void> {
        await this.retry(() => this.db.delete(new RecordId(table, id)));
    }

    async count(table: string, query?: QueryOptions): Promise<number> {
        const q = this.buildQuery(table, query, true);
        const res = await this.db.query<[{ count: number; }]>(q.statement, q.vars);

        const result = res as any; // Cast to inspect

        // Defensive coding:
        if (Array.isArray(result) && result.length > 0) {
            const first = result[0];

            // 1. Nested array result (common in query()): [[{ count: N }]]
            if (Array.isArray(first)) {
                if (first[0]?.count !== undefined) return first[0].count;
            }

            // 2. Direct result: [{ count: N }]
            if (first?.count !== undefined) return first.count;

            // 3. Result wrapper: [{ result: [{ count: N }], status: "OK" }]
            if (first?.result && Array.isArray(first.result)) {
                const inner = first.result[0];
                if (inner?.count !== undefined) return inner.count;
            }
        }

        return 0;
    }

    async deleteMany(table: string, query?: QueryOptions): Promise<void> {
        const q = this.buildQuery(table, query, false, true);
        await this.db.query(q.statement, q.vars);
    }

    async findMany<T>(table: string, query?: QueryOptions): Promise<T[]> {
        const q = this.buildQuery(table, query);
        try {
            const res = await this.db.query<T[]>(q.statement, q.vars);

            // Robust result extraction
            let result: any = res;
            if (Array.isArray(res) && res.length > 0) {
                if (Array.isArray(res[0])) result = res[0];
                else if ((res[0] as any).result && Array.isArray((res[0] as any).result)) result = (res[0] as any).result;
                else result = res[0] || [];
            }

            return (Array.isArray(result) ? result : []) as T[];
        } catch (e) {
            this.logger.error('SurrealAdapter', `findMany ${table} failed`, e);
            throw e;
        }
    }

    private buildQuery(table: string, options?: QueryOptions, isCount = false, isDelete = false): { statement: string, vars: any; } {
        // Basic query builder
        let type = isDelete ? 'DELETE' : 'SELECT';
        let fields = isDelete ? '' : (isCount ? 'count()' : '*');
        let from = `FROM type::table($table)`;
        let vars: any = { table };
        let clauses: string[] = [];

        if (options?.where) {
            Object.entries(options.where).forEach(([k, v], i) => {
                const varName = `where_${i}`;
                clauses.push(`${k} = $${varName}`);
                vars[varName] = v;
            });
        }

        if (options?.gt) {
            Object.entries(options.gt).forEach(([k, v], i) => {
                const varName = `gt_${i}`;
                clauses.push(`${k} > $${varName}`);
                vars[varName] = v;
            });
        }

        if (options?.lt) {
            Object.entries(options.lt).forEach(([k, v], i) => {
                const varName = `lt_${i}`;
                clauses.push(`${k} < $${varName}`);
                vars[varName] = v;
            });
        }

        let whereStr = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

        let suffix = '';
        if (!isCount && !isDelete) {
            if (options?.sort) {
                const sorts = Object.entries(options.sort).map(([k, v]) => `${k} ${v.toUpperCase()}`);
                if (sorts.length) suffix += ` ORDER BY ${sorts.join(', ')}`;
            }
            if (options?.limit) {
                suffix += ` LIMIT ${options.limit}`;
            }
            if (options?.offset) {
                suffix += ` START ${options.offset}`;
            }
        }

        // Handle Delete LIMIT separately because DELETE statements support LIMIT
        if (isDelete) {
            // Surreal DELETE supports WHERE ... 
            // Does it support LIMIT? Yes: DELETE user WHERE ... LIMIT 10
            // Does it support ORDER BY? Yes.
            if (options?.sort) {
                const sorts = Object.entries(options.sort).map(([k, v]) => `${k} ${v.toUpperCase()}`);
                if (sorts.length) suffix += ` ORDER BY ${sorts.join(', ')}`;
            }
            if (options?.limit) {
                suffix += ` LIMIT ${options.limit}`;
            }
        }

        // isDelete format: DELETE [FROM] table WHERE ...
        // SurrealQL: DELETE table WHERE ...
        if (isDelete) {
            return {
                statement: `DELETE type::table($table) ${whereStr}${suffix};`,
                vars
            };
        }

        const groupAll = isCount ? 'GROUP ALL' : '';

        return {
            statement: `SELECT ${fields} ${from} ${whereStr} ${groupAll} ${suffix};`,
            vars
        };
    }
}
