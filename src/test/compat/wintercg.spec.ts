
import { describe, expect, test } from "bun:test";
import { Shokupan } from "../../shokupan";

describe("WinterCG Adapter", () => {
    test("should initialize with wintercg adapter", async () => {
        const app = new Shokupan({
            adapter: 'wintercg'
        });

        // It should start up
        expect(app).toBeDefined();

        // Listen should log warning and return nothing/undefined
        await expect(app.listen(3000)).rejects.toThrow('WinterCG adapter does not support listen');
    });

    test("should use fetch directly", async () => {
        const app = new Shokupan({
            adapter: 'wintercg'
        });

        app.get("/hello", (ctx) => ctx.text("Hello WinterCG"));

        const req = new Request("http://localhost/hello");
        const res = await app.fetch(req);

        expect(res.status).toBe(200);
        expect(await res.text()).toBe("Hello WinterCG");
    });
});
