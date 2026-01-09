import { RecordId, Surreal, type Range, type Table } from 'surrealdb';


const G = globalThis as any;
G.__shokupan_db = G.__shokupan_db || null;
G.__shokupan_db_promise = G.__shokupan_db_promise || null;


async function ensureDb() {
    if (G.__shokupan_db) return G.__shokupan_db;
    if (G.__shokupan_db_promise) return G.__shokupan_db_promise;

    G.__shokupan_db_promise = (async () => {
        try {
            const { createNodeEngines } = await import('@surrealdb/node');
            const surreal = await import('surrealdb');

            const engine = process.env['SHOKUPAN_DB_ENGINE'] === 'memory' ? 'mem://' : 'rocksdb://database';

            const _db = new Surreal({
                engines: createNodeEngines(),
            });

            await _db.connect(engine, { namespace: "vendor", database: "shokupan" });


            // Define the tables with bare minimum schema
            await _db.query(`
            DEFINE TABLE OVERWRITE failed_requests SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE sessions SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE users SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE idempotency_keys SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE middleware_tracking SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE requests SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE metrics SCHEMALESS COMMENT "Created by Shokupan";
        `);

            G.__shokupan_db = _db;
            return _db;
        } catch (e: any) {
            G.__shokupan_db_promise = null; // Reset promise on failure to allow retries
            if (e.code === 'ERR_MODULE_NOT_FOUND' || e.message.includes('Cannot find module')) {
                throw new Error("SurrealDB dependencies not found. To use the datastore, please install 'surrealdb' and '@surrealdb/node'.");
            }
            throw e;
        }
    })();

    return G.__shokupan_db_promise;
}

// Lazy ready promise that triggers on access if we want, or just a promise that resolves when DB is ready.
// To maintain compatibility with `await datastore.ready`, we expose a promise that ensures DB is loaded.
// BUT, if we want it to be optional, we shouldn't trigger it globally.
// However, existing code might rely on it.
// We'll make `ready` valid but only checking connection if referenced.

export const datastore = {
    async get<T extends Record<string, any>>(recordId: RecordId | Table | Range<any, any>) {
        await ensureDb();
        return G.__shokupan_db.select(recordId as any) as Promise<T>;
    },
    async set(recordId: RecordId, value: Record<string, any>) {
        await ensureDb();
        return G.__shokupan_db.upsert(recordId).content(value);
    },
    async query<T extends Record<string, any>>(query: string, vars?: Record<string, unknown>) {
        await ensureDb();
        try {
            return G.__shokupan_db.query(query, vars).collect() as Promise<T>;
        } catch (e) {
            console.error("DS ERROR:", e);
            throw e;
        }
    },
    get ready() {
        return ensureDb().then(() => void 0);
    }
};

process.on("exit", async () => {
    if (G.__shokupan_db) await G.__shokupan_db.close();
});

