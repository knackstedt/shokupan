import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { createHash } from "crypto";
import { Shokupan } from "../../../shokupan";
import { Idempotency } from "../idempotency/plugin";

/**
 * Compute the scoped, hashed datastore id the middleware must produce for a
 * given (scope, key) pair. Mirrors the plugin's buildStorageKey so the tests
 * can assert on the exact identifier persisted in the datastore.
 */
function scopedKey(scope: string, key: string): string {
    return createHash('sha256').update(`${scope}\x1f${key}`).digest('hex');
}

describe("Idempotency Plugin", async () => {
    let getSpy: any;
    let setSpy: any;
    let store: Record<string, any> = {};
    const app = new Shokupan();
    app.use(Idempotency());
    await app.dbPromise;

    // Create a mock datastore since app.db is undefined without datastore config
    (app as any).datastore = {
        get: async (table: string, id: string) => {
            if (table !== 'idempotency') return null;
            return (store[id] || null);
        },
        upsert: async (table: string, id: string, value: any) => {
            if (table === 'idempotency') {
                store[id] = value;
            }
            return {};
        }
    };

    beforeAll(() => {
        // Mock datastore methods
        getSpy = spyOn(app.db!, 'get').mockImplementation(async (table, id) => {
            if (table !== 'idempotency') return null as any;
            return (store[id] || null) as any;
        });

        setSpy = spyOn(app.db!, 'upsert').mockImplementation(async (table, id, value) => {
            if (table === 'idempotency') {
                store[id] = value;
            }
            return {} as any;
        });
    });

    afterEach(() => {
        store = {};
        getSpy.mockClear();
        setSpy.mockClear();
    });

    test("Executes handler when no key provided", async () => {

        let hitCount = 0;
        app.get("/test", () => {
            hitCount++;
            return "ok";
        });

        const res = await app.fetch(new Request("http://localhost/test"));
        expect(hitCount).toBe(1);
        expect(await res.text()).toBe("ok");

        // No key, no storage
        expect(getSpy).not.toHaveBeenCalled();
        // expect(setSpy).not.toHaveBeenCalled();
    });

    test("Executes handler and stores result on first hit with key", async () => {

        let hitCount = 0;
        app.get("/test", () => {
            hitCount++;
            return { message: "ok" };
        });

        const req = new Request("http://localhost/test", {
            headers: { "Idempotency-Key": "key-1" }
        });

        const res = await app.fetch(req);

        expect(hitCount).toBe(1);
        expect(await res.json()).toEqual({ message: "ok" });

        const expectedKey = scopedKey('anonymous', 'key-1');

        // Should have checked storage with the scoped, hashed id
        expect(getSpy).toHaveBeenCalled();
        const getCallArgs = getSpy.mock.calls[0];
        expect(getCallArgs[0]).toBe('idempotency');
        expect(getCallArgs[1]).toBe(expectedKey);

        // Should have stored result under the scoped, hashed id
        expect(setSpy).toHaveBeenCalled();
        const setCallArgs = setSpy.mock.calls[0];
        expect(setCallArgs[0]).toBe('idempotency');
        expect(setCallArgs[1]).toBe(expectedKey);
        expect(setCallArgs[2].owner).toBe('anonymous');
        expect(JSON.parse(setCallArgs[2].body)).toEqual({ message: "ok" });
        expect(setCallArgs[2].status).toBe(200);
    });

    test("Returns stored response on second hit with same key", async () => {

        let hitCount = 0;
        app.get("/test", () => {
            hitCount++;
            return "result";
        });

        // First request
        const req1 = new Request("http://localhost/test", {
            headers: { "Idempotency-Key": "key-2" }
        });
        await app.fetch(req1);
        expect(hitCount).toBe(1);

        // Reset spy counts to focus on second request
        getSpy.mockClear();
        setSpy.mockClear();

        // Second request
        const req2 = new Request("http://localhost/test", {
            headers: { "Idempotency-Key": "key-2" }
        });
        const res2 = await app.fetch(req2);

        // Handler NOT called again
        expect(hitCount).toBe(1);

        // Result is same
        expect(await res2.text()).toBe("result");

        // Should have hit cache
        expect(res2.headers.get("X-Idempotency-Hit")).toBe("true");

        // Should NOT store again
        expect(setSpy).not.toHaveBeenCalled();
    });

    test("Handles failed requests appropriately (stores them)", async () => {
        // As per current implementation, we store all responses.


        app.get("/fail", (ctx) => {
            return ctx.text("error", 400);
        });

        const req = new Request("http://localhost/fail", {
            headers: { "Idempotency-Key": "key-fail" }
        });

        const res = await app.fetch(req);
        expect(res.status).toBe(400);

        // Should record
        expect(setSpy).toHaveBeenCalled();
    });

    test("Different keys do not conflict", async () => {

        let hitCount = 0;
        app.get("/test", () => {
            hitCount++;
            return "ok";
        });

        await app.fetch(new Request("http://localhost/test", { headers: { "Idempotency-Key": "k1" } }));
        await app.fetch(new Request("http://localhost/test", { headers: { "Idempotency-Key": "k2" } }));

        expect(hitCount).toBe(2);
        const keys = Object.keys(store);
        expect(keys).toContain(scopedKey('anonymous', 'k1'));
        expect(keys).toContain(scopedKey('anonymous', 'k2'));
    });

    test("Rejects invalid keys (too long / non-printable) without caching", async () => {
        let hitCount = 0;
        app.get("/test", () => {
            hitCount++;
            return "ok";
        });

        // Over-length key: default maxKeyLength is 255
        const tooLong = 'x'.repeat(256);
        const res1 = await app.fetch(new Request("http://localhost/test", { headers: { "Idempotency-Key": tooLong } }));
        expect(hitCount).toBe(1);
        expect(await res1.text()).toBe("ok");
        // No storage should have occurred for the invalid key
        expect(setSpy).not.toHaveBeenCalled();

        // Non-printable / whitespace-only key is rejected after trim
        getSpy.mockClear();
        setSpy.mockClear();
        hitCount = 0;
        const res2 = await app.fetch(new Request("http://localhost/test", { headers: { "Idempotency-Key": "   " } }));
        expect(hitCount).toBe(1);
        expect(setSpy).not.toHaveBeenCalled();
    });

    test("Same key under different ownership scopes is isolated (no cross-user leakage)", async () => {
        // Two apps with distinct scope functions emulate two different users.
        const storeA: Record<string, any> = {};
        const storeB: Record<string, any> = {};

        const appA = new Shokupan();
        appA.use(Idempotency({ scope: () => 'user-alice' }));
        await appA.dbPromise;
        (appA as any).datastore = {
            get: async (_t: string, id: string) => storeA[id] ?? null,
            upsert: async (_t: string, id: string, v: any) => { storeA[id] = v; return {}; }
        };
        spyOn(appA.db!, 'get').mockImplementation(async (_t, id) => storeA[id as string] ?? null);
        spyOn(appA.db!, 'upsert').mockImplementation(async (_t, id, v) => { storeA[id as string] = v; return {}; });

        const appB = new Shokupan();
        appB.use(Idempotency({ scope: () => 'user-bob' }));
        await appB.dbPromise;
        (appB as any).datastore = {
            get: async (_t: string, id: string) => storeB[id] ?? null,
            upsert: async (_t: string, id: string, v: any) => { storeB[id] = v; return {}; }
        };
        spyOn(appB.db!, 'get').mockImplementation(async (_t, id) => {
            // Critical: a shared/global table would surface alice's record here.
            // Each scope must resolve to a distinct id, so bob never sees alice's entry.
            return storeB[id as string] ?? null;
        });
        spyOn(appB.db!, 'upsert').mockImplementation(async (_t, id, v) => { storeB[id as string] = v; return {}; });

        let aHits = 0;
        let bHits = 0;
        appA.get("/secret", () => { aHits++; return { secret: "alice-secret" }; });
        appB.get("/secret", () => { bHits++; return { secret: "bob-secret" }; });

        // Alice stores her response under the shared key.
        const aliceRes = await appA.fetch(new Request("http://localhost/secret", {
            headers: { "Idempotency-Key": "shared-key" }
        }));
        expect(aHits).toBe(1);
        expect(await aliceRes.json()).toEqual({ secret: "alice-secret" });

        // Bob reuses the same Idempotency-Key. He must NOT receive alice's
        // cached response; his handler must execute and store his own result.
        const bobRes = await appB.fetch(new Request("http://localhost/secret", {
            headers: { "Idempotency-Key": "shared-key" }
        }));
        expect(bHits).toBe(1);
        expect(await bobRes.json()).toEqual({ secret: "bob-secret" });
        expect(bobRes.headers.get("X-Idempotency-Hit")).toBeNull();

        // The scoped ids must differ.
        expect(scopedKey('user-alice', 'shared-key')).not.toBe(scopedKey('user-bob', 'shared-key'));
        expect(Object.keys(storeA)).toEqual([scopedKey('user-alice', 'shared-key')]);
        expect(Object.keys(storeB)).toEqual([scopedKey('user-bob', 'shared-key')]);

        // A second request from alice with the same key still hits her cache.
        const aliceRes2 = await appA.fetch(new Request("http://localhost/secret", {
            headers: { "Idempotency-Key": "shared-key" }
        }));
        expect(aHits).toBe(1);
        expect(aliceRes2.headers.get("X-Idempotency-Hit")).toBe("true");
        expect(await aliceRes2.json()).toEqual({ secret: "alice-secret" });
    });
});
