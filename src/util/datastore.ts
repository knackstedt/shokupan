import { createNodeEngines } from '@surrealdb/node';
import { RecordId, Surreal } from 'surrealdb';

const db = new Surreal({
    engines: createNodeEngines(),
});

db.connect("rocksdb://database", { namespace: "vendor", database: "shokupan" }).then(() => {
    // Define the tables with bare minimum schema
    db.query(`
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
    }
};

process.on("exit", async () => {
    await db.close();
});
