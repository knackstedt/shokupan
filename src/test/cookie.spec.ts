import { describe, expect, it } from "bun:test";
import { Convection } from '../convect';

describe("Cookie Support", () => {
    it("should set a simple cookie", async () => {
        const app = new Convection({ port: 0 });

        app.get("/cookie", (ctx) => {
            ctx.setCookie("foo", "bar");
            return "ok";
        });

        const server = app.listen();
        const res = await fetch(`http://localhost:${server.port}/cookie`);

        expect(res.headers.get("set-cookie")).toBe("foo=bar");
        server.stop();
    });

    it("should set a complex cookie with options", async () => {
        const app = new Convection({ port: 0 });

        app.get("/complex-cookie", (ctx) => {
            ctx.setCookie("user", "alice", {
                maxAge: 3600,
                httpOnly: true,
                secure: true,
                path: "/admin",
                sameSite: "strict"
            });
            return "ok";
        });

        const server = app.listen();
        const res = await fetch(`http://localhost:${server.port}/complex-cookie`);
        const setCookie = res.headers.get("set-cookie");

        expect(setCookie).toContain("user=alice");
        expect(setCookie).toContain("Max-Age=3600");
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("Secure");
        expect(setCookie).toContain("Path=/admin");
        expect(setCookie).toContain("SameSite=Strict");
        server.stop();
    });
});
