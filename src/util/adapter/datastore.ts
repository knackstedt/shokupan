export interface QueryOptions {
    /**
     * strict equality matches
     */
    where?: Record<string, any>;
    /**
     * less than matches
     */
    lt?: Record<string, number | string>;
    /**
     * greater than matches
     */
    gt?: Record<string, number | string>;
    /**
     * sort results by field
     */
    sort?: Record<string, 'asc' | 'desc'>;
    limit?: number;
    offset?: number;
}

export interface DatastoreAdapter {
    name: string;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    setupSchema(): Promise<void>;

    /**
     * Get a single record by global ID (table + id)
     */
    get<T>(table: string, id: string): Promise<T | null>;

    /**
     * Create a new record. Fails if exists.
     */
    create<T>(table: string, id: string, data: T): Promise<T>;

    /**
     * Update an existing record. Fails if not exists.
     * Merges data.
     */
    update<T>(table: string, id: string, data: Partial<T>): Promise<T>;

    /**
     * Create or update a record.
     */
    upsert<T>(table: string, id: string, data: T): Promise<T>;

    /**
     * Delete a single record
     */
    delete(table: string, id: string): Promise<void>;

    /**
     * Count records matching query
     */
    count(table: string, query?: QueryOptions): Promise<number>;

    /**
     * Delete multiple records matching query
     */
    deleteMany(table: string, query?: QueryOptions): Promise<void>;

    /**
     * Find multiple records matching query
     */
    findMany<T>(table: string, query?: QueryOptions): Promise<T[]>;
}
