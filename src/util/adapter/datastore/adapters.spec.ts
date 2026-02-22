import { describe, expect, test } from "bun:test";
import { nanoid } from "nanoid";
import type { DatastoreAdapter } from "../datastore";
import { SqliteAdapter } from "./sqlite";
import { SurrealAdapter } from "./surreal";

// Define the adapters to test
const adapters = [
    {
        name: "SqliteAdapter",
        create: async () => {
            const adapter = new SqliteAdapter({ filename: ":memory:" });
            await adapter.connect();
            await adapter.setupSchema();
            return adapter;
        },
        cleanup: async (adapter: DatastoreAdapter) => {
            await adapter.disconnect();
        }
    },
    {
        name: "SurrealAdapter",
        create: async () => {
            // Use a unique namespace/db per test to avoid collisions in shared mem process
            const ns = nanoid();
            const dbName = nanoid();
            const adapter = new SurrealAdapter({
                url: "mem://",
                namespace: ns,
                database: dbName
            });
            await adapter.connect();
            await adapter.setupSchema();
            return adapter;
        },
        cleanup: async (adapter: DatastoreAdapter) => {
            await adapter.disconnect();
        }
    },
    {
        name: "LevelAdapter",
        create: async () => {
            const { LevelAdapter } = await import('./level');
            const { MemoryLevel } = await import('memory-level');
            const adapter = new LevelAdapter({ db: new MemoryLevel() });
            await adapter.connect();
            await adapter.setupSchema();
            return adapter;
        },
        cleanup: async (adapter: DatastoreAdapter) => {
            await adapter.disconnect();
        }
    }
];

for (const { name, create, cleanup } of adapters) {
    describe(`DatastoreAdapter: ${name}`, () => {

        async function withDB(fn: (db: DatastoreAdapter) => Promise<void>) {
            const db = await create();
            try {
                await fn(db);
            } finally {
                await cleanup(db);
            }
        }

        test("create and get", () => withDB(async (db) => {
            const data = { foo: "bar", num: 123 };
            const created = await db.create("items", "item1", data);
            expect(created).toMatchObject(data);

            const fetched = await db.get("items", "item1");
            expect(fetched).toMatchObject(data);
        }));

        test("create fails if exists", () => withDB(async (db) => {
            await db.create("items", "item1", { a: 1 });
            try {
                await db.create("items", "item1", { a: 2 });
                expect(true).toBe(false); // Should fail if we reach here
            } catch (e: any) {
                expect(e).toBeDefined();
            }
        }));

        test("upsert creates new", () => withDB(async (db) => {
            const data = { a: 1 };
            const res = await db.upsert("items", "item1", data);
            expect(res).toMatchObject(data);
            const fetched = await db.get("items", "item1");
            expect(fetched).toMatchObject(data);
        }));

        test("upsert overwrites existing", () => withDB(async (db) => {
            await db.create("items", "item1", { a: 1 });
            await db.upsert("items", "item1", { a: 2 });
            const fetched = await db.get<any>("items", "item1");
            expect(fetched.a).toBe(2);
        }));

        test("update partial", () => withDB(async (db) => {
            await db.create("items", "item1", { a: 1, b: 2 });
            await db.update("items", "item1", { b: 3 });
            const fetched = await db.get<any>("items", "item1");
            expect(fetched.a).toBe(1);
            expect(fetched.b).toBe(3);
        }));

        test("delete", () => withDB(async (db) => {
            await db.create("items", "item1", { a: 1 });
            await db.delete("items", "item1");
            const fetched = await db.get("items", "item1");
            expect(fetched).toBeNull();
        }));

        test("count", () => withDB(async (db) => {
            await db.create("items", "1", { n: 1 });
            await db.create("items", "2", { n: 2 });
            await db.create("items", "3", { n: 3 });

            const count = await db.count("items");
            expect(count).toBe(3);
        }));

        test("findMany", () => withDB(async (db) => {
            await db.create("users", "1", { name: "Alice", age: 30 });
            await db.create("users", "2", { name: "Bob", age: 25 });
            await db.create("users", "3", { name: "Charlie", age: 35 });

            const all = await db.findMany("users");
            expect(all.length).toBe(3);

            // Test where
            const young = await db.findMany<any>("users", { where: { age: 25 } });
            expect(young.length).toBe(1);
            expect(young[0].name).toBe("Bob");

            // Test sort (if supported) & limit
            const sorted = await db.findMany<any>("users", { sort: { age: 'asc' } });
            expect(sorted[0].name).toBe("Bob");
            expect(sorted[2].name).toBe("Charlie");

            const limit = await db.findMany<any>("users", { sort: { age: 'asc' }, limit: 2 });
            expect(limit.length).toBe(2);
            expect(limit[1].name).toBe("Alice");
        }));

        test("deleteMany", () => withDB(async (db) => {
            await db.create("logs", "1", { level: "info" });
            await db.create("logs", "2", { level: "error" });
            await db.create("logs", "3", { level: "info" });

            await db.deleteMany("logs", { where: { level: "info" } });

            const remaining = await db.findMany("logs");
            expect(remaining.length).toBe(1);
            const item = remaining[0] as any;
            expect(item.level).toBe("error");
        }));
    });
}
