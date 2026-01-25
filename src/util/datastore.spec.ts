
import { describe, expect, it, mock } from "bun:test";
import { SurrealDatastore } from "./datastore";

const mockDb = {
    select: mock(async () => []),
    create: mock(async () => []),
    close: mock(async () => { }),
    query: mock(() => ({ collect: async () => [] }))
};

describe("Surreal Datastore", () => {
    it("should initialize and proxy methods", async () => {
        const ds = new SurrealDatastore(mockDb as any);
        await ds.select("test");
        expect(mockDb.select).toHaveBeenCalled();

        await ds.disconnect();
        expect(mockDb.close).toHaveBeenCalled();
    });

    it("should create schema", async () => {
        const ds = new SurrealDatastore(mockDb as any);
        await ds.createSchema();
        expect(mockDb.query).toHaveBeenCalled();
    });
});
