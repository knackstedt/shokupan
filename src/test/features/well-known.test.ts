import { describe, expect, it } from "bun:test";
import { load } from "js-yaml";
import { Shokupan } from "../../shokupan";

describe("Well-Known Files", () => {
    it("should serve openapi.yaml when enabled", async () => {
        const app = new Shokupan({
            enableOpenApiGen: true,
            port: 0
        });

        app.get("/test", () => "hello");
        const server = await app.listen();
        const port = server.port;

        const res = await fetch(`http://localhost:${port}/.well-known/openapi.yaml`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("application/yaml");

        const text = await res.text();
        const yaml = load(text) as any;
        expect(yaml.openapi).toBeDefined();
        expect(yaml.paths["/test"]).toBeDefined();

        await app.stop();
    });

    it("should serve ai-plugin.json with defaults", async () => {
        const app = new Shokupan({
            enableOpenApiGen: true,
            port: 0,
            aiPlugin: { enabled: true }
        });

        const server = await app.listen();
        const port = server.port;

        const res = await fetch(`http://localhost:${port}/.well-known/ai-plugin.json`);
        expect(res.status).toBe(200);
        const json = await res.json();

        expect(json.schema_version).toBe("v1");
        expect(json.api.url).toContain(".well-known/openapi.yaml");

        await app.stop();
    });

    it("should serve api-catalog with defaults", async () => {
        const app = new Shokupan({
            enableOpenApiGen: true,
            port: 0,
            apiCatalog: { enabled: true }
        });

        const server = await app.listen();
        const port = server.port;

        const res = await fetch(`http://localhost:${port}/.well-known/api-catalog`);
        expect(res.status).toBe(200);
        const json = await res.json();

        expect(json.versions).toBeDefined();
        expect(json.versions[0].spec_url).toContain(".well-known/openapi.yaml");

        await app.stop();
    });

    it("should not serve files if disabled", async () => {
        const app = new Shokupan({
            enableOpenApiGen: true,
            port: 0,
            aiPlugin: { enabled: false },
            apiCatalog: { enabled: false }
        });

        const server = await app.listen();
        const port = server.port;

        const res1 = await fetch(`http://localhost:${port}/.well-known/ai-plugin.json`);
        expect(res1.status).toBe(404);

        const res2 = await fetch(`http://localhost:${port}/.well-known/api-catalog`);
        expect(res2.status).toBe(404);

        await app.stop();
    });
});
