import { createNodeEngines } from '@surrealdb/node';
import { RecordId, Surreal } from 'surrealdb';

const engine = process.env.SHOKUPAN_DB_ENGINE === 'memory' ? 'mem://' : 'rocksdb://database';

const db = new Surreal({
    engines: createNodeEngines(),
});

const ready = db.connect(engine, { namespace: "vendor", database: "shokupan" }).then(() => {
    // Define the tables with bare minimum schema
    return db.query(`
        DEFINE TABLE OVERWRITE failed_requests SCHEMALESS COMMENT "Created by Shokupan";
        DEFINE TABLE OVERWRITE sessions SCHEMALESS COMMENT "Created by Shokupan";
        DEFINE TABLE OVERWRITE users SCHEMALESS COMMENT "Created by Shokupan";
    `);
});

export const datastore = {
    get<T extends Record<string, any>>(store: string, key: string) {
        return db.select<T>(new RecordId(store, key));
    },
    set(store: string, key: string, value: any) {
        return db.create(new RecordId(store, key)).content(value);
    },
    async query(query: string, vars?: Record<string, unknown>) {
        try {
            // console.error("DS QUERY:", query);
            const r = await db.query(query, vars);
            // console.error("DS RESULT:", JSON.stringify(r));
            return r;
        } catch (e) {
            console.error("DS ERROR:", e);
            throw e;
        }
    },
    ready
};

process.on("exit", async () => {
    await db.close();
});
