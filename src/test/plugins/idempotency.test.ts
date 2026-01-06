import { afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { Idempotency } from "../../plugins/application/idempotency/plugin";
import { Shokupan } from "../../shokupan";
import { datastore } from "../../util/datastore";

describe("Idempotency Plugin", () => {
    let getSpy: any;
    let setSpy: any;
    let store: Record<string, any> = {};

    beforeAll(() => {
        // Mock datastore methods
        // @ts-ignore
        getSpy = spyOn(datastore, 'get').mockImplementation(async (table, key) => {
            if (table !== 'idempotency_keys') return null as any;
            return (store[key] || null) as any;
        });

        // @ts-ignore
        setSpy = spyOn(datastore, 'set').mockImplementation(async (table, key, value) => {
            if (table === 'idempotency_keys') {
                store[key] = value;
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
        const app = new Shokupan();
        app.use(Idempotency());
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
        expect(setSpy).not.toHaveBeenCalled();
    });

    test("Executes handler and stores result on first hit with key", async () => {
        const app = new Shokupan();
        app.use(Idempotency());
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
        expect(getSpy).toHaveBeenCalledWith('idempotency_keys', 'key-1');

        // Should have stored result
        expect(setSpy).toHaveBeenCalled();
        const callArgs = setSpy.mock.calls[0];
        expect(callArgs[0]).toBe('idempotency_keys');
        expect(callArgs[1]).toBe('key-1');
        expect(JSON.parse(callArgs[2].body)).toEqual({ message: "ok" });
        expect(callArgs[2].status).toBe(200);
    });

    test("Returns stored response on second hit with same key", async () => {
        const app = new Shokupan();
        app.use(Idempotency());
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
        const app = new Shokupan();
        app.use(Idempotency());

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
        const app = new Shokupan();
        app.use(Idempotency());
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
