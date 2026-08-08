import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AsyncApiPlugin } from "../../plugins/application/asyncapi/plugin";
import { DebugPlugin } from "../../plugins/application/debug/plugin";
import { Shokupan } from "../../shokupan";

describe("Security: Plugin Path Traversal", () => {
    let app: Shokupan;
    let server: any;

    beforeAll(async () => {
        app = new Shokupan({ enableAsyncApiGen: true, blockOnAsyncApiGen: true, enableAsyncAstScanning: false });
        app.register(new DebugPlugin({ path: '/debug' }));
        app.register(new AsyncApiPlugin({ path: '/asyncapi' }));
        server = await app.listen(0);
    });

    afterAll(async () => {
        await app.stop(true);
    });

    test("DebugPlugin /asyncapi/_code blocks path traversal", async () => {
        const res = await fetch(`http://localhost:${server!.port}/debug/asyncapi/_code?file=../package.json`);
        expect(res.status).toBe(403);
    });

    test("DebugPlugin /asyncapi/_code blocks path traversal via cwd prefix", async () => {
        const res = await fetch(`http://localhost:${server!.port}/debug/asyncapi/_code?file=../${process.cwd().split('/').pop()}foo/bar.txt`);
        expect(res.status).toBe(403);
    });

    test("DebugPlugin /explorer/_source blocks path traversal", async () => {
        const res = await fetch(`http://localhost:${server!.port}/debug/explorer/_source?file=../package.json`);
        expect(res.status).toBe(403);
    });

    test("AsyncApiPlugin /_code blocks path traversal", async () => {
        const res = await fetch(`http://localhost:${server!.port}/asyncapi/_code?file=../package.json`);
        expect(res.status).toBe(403);
    });

    test("DebugPlugin /asyncapi/_code allows valid file", async () => {
        const res = await fetch(`http://localhost:${server!.port}/debug/asyncapi/_code?file=package.json`);
        expect(res.status).not.toBe(403);
    });

    test("DebugPlugin /asyncapi/_code refuses to serve .env files", async () => {
        for (const file of ['.env', '.env.local', '.env.production']) {
            const res = await fetch(`http://localhost:${server!.port}/debug/asyncapi/_code?file=${encodeURIComponent(file)}`);
            expect(res.status).toBe(403);
        }
    });

    test("DebugPlugin /asyncapi/_code refuses to serve private keys / certs", async () => {
        for (const file of ['server.pem', 'tls/key.pem', 'cert.key', 'server.p12']) {
            const res = await fetch(`http://localhost:${server!.port}/debug/asyncapi/_code?file=${encodeURIComponent(file)}`);
            expect(res.status).toBe(403);
        }
    });

    test("DebugPlugin /explorer/_source refuses to serve .env files", async () => {
        const res = await fetch(`http://localhost:${server!.port}/debug/explorer/_source?file=${encodeURIComponent('.env')}`);
        expect(res.status).toBe(403);
    });

    test("AsyncApiPlugin /_code refuses to serve .env files", async () => {
        const res = await fetch(`http://localhost:${server!.port}/asyncapi/_code?file=${encodeURIComponent('.env')}`);
        expect(res.status).toBe(403);
    });
});
