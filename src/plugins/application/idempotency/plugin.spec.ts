import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { Shokupan } from "../../../shokupan";
import { Idempotency } from "../idempotency/plugin";

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

        // Should have checked storage
        expect(getSpy).toHaveBeenCalled();
        const getCallArgs = getSpy.mock.calls[0];
        expect(getCallArgs[0]).toBe('idempotency');
        expect(getCallArgs[1]).toBe('key-1');

        // Should have stored result
        expect(setSpy).toHaveBeenCalled();
        const setCallArgs = setSpy.mock.calls[0];
        expect(setCallArgs[0]).toBe('idempotency');
        expect(setCallArgs[1]).toBe('key-1');
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
        expect(keys).toContain("k1");
        expect(keys).toContain("k2");
    });
});
