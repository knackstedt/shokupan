
import { describe, expect, it, mock } from "bun:test";
import { ShokupanRouter } from "../../router";
import { Shokupan } from "../../shokupan";

describe("Timeouts", () => {
    it("should use global requestTimeout", async () => {
        const app = new Shokupan({
            requestTimeout: 5000,
            enableOpenApiGen: false
        });

        const mockServer = {
            timeout: mock((req, seconds) => { }),
            upgrade: () => false
        } as any;

        app.get("/", (ctx) => "ok");

        const req = new Request("http://localhost/");
        await app.fetch(req, mockServer);

        expect(mockServer.timeout).toHaveBeenCalled();
        expect(mockServer.timeout).toHaveBeenCalledWith(req, 5);
    });

    it("should use router override requestTimeout", async () => {
        const app = new Shokupan({
            requestTimeout: 5000,
            enableOpenApiGen: false
        });

        const router = new ShokupanRouter({
            requestTimeout: 1000
        });

        router.get("/sub", (ctx) => "ok");
        app.mount("/api", router);

        const mockServer = {
            timeout: mock((req, seconds) => { }),
            upgrade: () => false
        } as any;

        const req = new Request("http://localhost/api/sub");
        await app.fetch(req, mockServer);

        expect(mockServer.timeout).toHaveBeenCalled();
        expect(mockServer.timeout).toHaveBeenCalledWith(req, 1);
    });

    it("should prefer router timeout over global", async () => {
        const app = new Shokupan({
            requestTimeout: 10000,
            enableOpenApiGen: false
        });

        const router = new ShokupanRouter({ requestTimeout: 2000 });
        router.get("/", (ctx) => "ok");
        app.mount("/sub", router);

        const mockServer = {
            timeout: mock((req, seconds) => { }),
            upgrade: () => false
        } as any;

        const req = new Request("http://localhost/sub/");
        await app.fetch(req, mockServer);

        expect(mockServer.timeout).toHaveBeenCalledWith(req, 2);
    });

    it("should disable timeout if 0", async () => {
        // Not strictly implemented "disable" logic other than not calling if 0?
        // Code says: if (effectiveTimeout !== undefined && effectiveTimeout > 0)
        // So passing 0 should prevent call.
        const app = new Shokupan({
            requestTimeout: 5000,
            enableOpenApiGen: false
        });

        const router = new ShokupanRouter({ requestTimeout: 0 });
        router.get("/", (ctx) => "ok");
        app.mount("/sub", router);

        const mockServer = {
            timeout: mock((req, seconds) => { }),
            upgrade: () => false
        } as any;

        const req = new Request("http://localhost/sub/");
        await app.fetch(req, mockServer);

        expect(mockServer.timeout).not.toHaveBeenCalled();
    });
});
