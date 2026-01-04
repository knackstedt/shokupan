
let db: any;
let dbPromise: Promise<any> | null = null;
let RecordId: any;

async function ensureDb() {
    if (db) return db;
    if (dbPromise) return dbPromise;

    dbPromise = (async () => {
        try {
            const { createNodeEngines } = await import('@surrealdb/node');
            const surreal = await import('surrealdb');
            const Surreal = surreal.Surreal;
            RecordId = surreal.RecordId;

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
        `);

            db = _db;
            return db;
        } catch (e: any) {
            dbPromise = null; // Reset promise on failure to allow retries
            if (e.code === 'ERR_MODULE_NOT_FOUND' || e.message.includes('Cannot find module')) {
                throw new Error("SurrealDB dependencies not found. To use the datastore, please install 'surrealdb' and '@surrealdb/node'.");
            }
            throw e;
        }
    })();

    return dbPromise;
}

// Lazy ready promise that triggers on access if we want, or just a promise that resolves when DB is ready.
// To maintain compatibility with `await datastore.ready`, we expose a promise that ensures DB is loaded.
// BUT, if we want it to be optional, we shouldn't trigger it globally.
// However, existing code might rely on it.
// We'll make `ready` valid but only checking connection if referenced.

export const datastore = {
    async get<T extends Record<string, any>>(store: string, key: string) {
        await ensureDb();
        return db.select(new RecordId(store, key)) as Promise<T>;
    },
    async set(store: string, key: string, value: any) {
        await ensureDb();
        return db.create(new RecordId(store, key)).content(value);
    },
    async query(query: string, vars?: Record<string, unknown>) {
        await ensureDb();
        try {
            // console.error("DS QUERY:", query);
            const r = await db.query(query, vars);
            // Result handling might differ if using types, but `any` is safe for now
            // console.error("DS RESULT:", JSON.stringify(r));
            return Array.isArray(r) ? r : r?.collect ? await (r as any).collect() : r;
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
    if (db) await db.close();
});

