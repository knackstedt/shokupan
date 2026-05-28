import { RecordId, Surreal, type RecordIdRange, type Table } from 'surrealdb';


export class SurrealDatastore {
    constructor(
        private readonly db: Surreal
    ) {
        process.on("exit", async () => {
            await this.disconnect();
        });
    }

    createSchema() {
        this.db.query(`
            DEFINE TABLE OVERWRITE failed_requests SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE sessions SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE users SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE idempotency_keys SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE middleware_tracking SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE requests SCHEMALESS COMMENT "Created by Shokupan";
            DEFINE TABLE OVERWRITE metrics SCHEMALESS COMMENT "Created by Shokupan";
        `).collect();
    }

    /**
     * Select a record or contents of a table by its ID.
     */
    async select<T = unknown>(id: RecordId | RecordIdRange | Table) {
        return this.db.select<T>(id as any);
    }

    /**
     * Merge update data into a record by its ID.
     */
    async merge<T extends Record<string, any>>(id: RecordId, data: T) {
        return this.db.update<T>(id).merge(data).catch((err: any) => {
            if (err.message.includes('This transaction can be retried')) {
                return this.db.update<T>(id).merge(data);
            }
            throw err;
        });
    }

    /**
     * Create a record by its ID.
     */
    async create<T extends Record<string, any>>(id: RecordId, data: Omit<T, 'id'>) {
        return this.db.create(id).content(data).catch((err: any) => {
            if (err.message.includes('This transaction can be retried')) {
                return this.db.create(id).content(data);
            }
            throw err;
        });
    }

    /**
     * Upsert a record by its ID.
     */
    async upsert<T extends Record<string, any>>(id: RecordId, data: T) {
        return this.db.upsert<T>(id).content(data).catch((err: any) => {
            if (err.message.includes('This transaction can be retried')) {
                return this.db.upsert<T>(id).content(data);
            }
            throw err;
        });
    }

    /**
     * Delete a record by its ID.
     */
    async delete(id: RecordId) {
        return this.db.delete(id).catch((err: any) => {
            if (err.message.includes('This transaction can be retried')) {
                return this.db.delete(id);
            }
            throw err;
        });
    }

    /**
     * Run a SurrealDB query.
     */
    async query<T extends Array<unknown>>(query: string, vars?: Record<string, any>) {
        return this.db.query(query, vars).collect<T>().catch((err: any) => {
            if (err.message.includes('This transaction can be retried')) {
                return this.db.query(query, vars).collect<T>();
            }
            throw err;
        });
    }

    /**
     * Create a relationship between two records.
     */
    async relate(fromId: any, edgeId: any, toId: any, data?: Record<string, any>) {
        return this.db.relate(fromId, edgeId, toId, data).catch((err: any) => {
            if (err.message.includes('This transaction can be retried')) {
                return this.db.relate(fromId, edgeId, toId, data);
            }
            throw err;
        });
    }


    disconnect() {
        return this.db.close();
    }
}
