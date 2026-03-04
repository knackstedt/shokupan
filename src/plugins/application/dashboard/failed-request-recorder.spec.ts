import { describe, expect, spyOn, test } from "bun:test";
import { Shokupan } from "../../../shokupan";
import { FailedRequestRecorder } from "./failed-request-recorder";

// Mock datastore methods via app.db instance

describe("FailedRequestRecorder Plugin", () => {
    let countSpy: any;
    let upsertSpy: any;
    let deleteManySpy: any;

    test("Records failed requests", async () => {
        const app = new Shokupan({
            datastore: { adapter: 'sqlite', options: { inMemory: true } }
        });
        // Wait for DB init
        await app.dbPromise;

        // Spy on DB methods
        // @ts-ignore
        upsertSpy = spyOn(app.db, 'upsert').mockImplementation(async () => { return {} as any; });
        // @ts-ignore
        countSpy = spyOn(app.db, 'count').mockImplementation(async () => 0);
        // @ts-ignore
        deleteManySpy = spyOn(app.db, 'deleteMany').mockImplementation(async () => undefined);

        app.use(FailedRequestRecorder());

        app.get("/fail", () => {
            throw new Error("Test Failure");
        });

        try {
            await app.fetch(new Request("http://localhost/fail"));
        } catch (e) { }

        // Allow async bg task
        await new Promise(r => setTimeout(r, 50));

        expect(upsertSpy).toHaveBeenCalled();
        const callArgs = upsertSpy.mock.calls[0];
        // expected: table, id, data
        expect(callArgs[0]).toBe('failed_requests');
        const data = callArgs[2];
        expect(data.path).toBe("/fail");
        expect(data.error).toBe("Test Failure");
    });

    test("Enforces Max Capacity", async () => {
        const max = 5;
        const app = new Shokupan({
            datastore: { adapter: 'sqlite', options: { inMemory: true } }
        });
        await app.dbPromise;

        // Mock returning count > max
        // @ts-ignore
        countSpy = spyOn(app.db, 'count').mockImplementation(async () => 10);
        // @ts-ignore
        deleteManySpy = spyOn(app.db, 'deleteMany').mockImplementation(async () => undefined);
        // @ts-ignore
        upsertSpy = spyOn(app.db, 'upsert').mockImplementation(async () => { return {} as any; });

        app.use(FailedRequestRecorder({ maxCapacity: max }));

        app.get("/fail", () => { throw new Error("Fail"); });
        try { await app.fetch(new Request("http://localhost/fail")); } catch (e) { }
        await new Promise(r => setTimeout(r, 50));

        // Should call deleteMany with limit
        // Check calls to deleteManySpy
        const calls = deleteManySpy.mock.calls;
        // First deleteMany is for TTL (lt: cutoff)
        // Second deleteMany is for Capacity (limit: toDelete)

        // We expect at least one call with limit
        const capacityCall = calls.find((c: any[]) => c[1]?.limit !== undefined);
        expect(capacityCall).toBeDefined();
        // 10 - 5 = 5
        expect(capacityCall[1].limit).toBe(5);
        expect(capacityCall[1].sort).toEqual({ timestamp: 'asc' });
    });

    test("Enforces TTL", async () => {
        const ttl = 1000;
        const app = new Shokupan({
            datastore: { adapter: 'sqlite', options: { inMemory: true } }
        });
        await app.dbPromise;

        // @ts-ignore
        deleteManySpy = spyOn(app.db, 'deleteMany').mockImplementation(async () => undefined);
        // @ts-ignore
        countSpy = spyOn(app.db, 'count').mockImplementation(async () => 0);
        // @ts-ignore
        upsertSpy = spyOn(app.db, 'upsert').mockImplementation(async () => { return {} as any; });

        app.use(FailedRequestRecorder({ ttl }));

        app.get("/fail", () => { throw new Error("Fail"); });
        try { await app.fetch(new Request("http://localhost/fail")); } catch (e) { }
        await new Promise(r => setTimeout(r, 50));

        // Should call deleteMany with lt timestamp
        const ttlCall = deleteManySpy.mock.calls.find((c: any[]) => c[1]?.lt?.timestamp !== undefined);
        expect(ttlCall).toBeDefined();
    });
});
