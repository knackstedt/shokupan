
import { describe, expect, it } from "bun:test";
import { ShokupanRouter } from "../router";
import { Shokupan } from "../shokupan";

const mockRenderer = (element: any) => {
    if (typeof element === "string") return element;
    return `<div>${element.tag}</div>`;
};

describe("JSX Rendering", () => {
    it("should render using global renderer", async () => {
        const app = new Shokupan({
            renderer: mockRenderer
        });

        app.get("/test", (ctx) => {
            return ctx.jsx({ tag: "hello" });
        });

        const res = await app.fetch(new Request("http://localhost/test"));
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("text/html");
        expect(await res.text()).toBe("<div>hello</div>");
    });

    it("should throw error if no renderer configured", async () => {
        const app = new Shokupan();

        app.get("/fail", (ctx) => {
            return ctx.jsx({ tag: "fail" });
        });

        const res = await app.fetch(new Request("http://localhost/fail"));
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toBe("No JSX renderer configured");
    });

    it("should use router-level renderer override", async () => {
        const app = new Shokupan({
            renderer: () => "global"
        });

        const router = new ShokupanRouter({
            renderer: () => "router"
        });

        router.get("/sub", (ctx) => {
            return ctx.jsx({});
        });

        app.mount("/api", router);

        const res = await app.fetch(new Request("http://localhost/api/sub"));
        expect(await res.text()).toBe("router");
    });

    it("should use route-level renderer override", async () => {
        const app = new Shokupan({
            renderer: () => "global"
        });

        app.add({
            method: "GET",
            path: "/override",
            renderer: () => "route",
            handler: (ctx) => ctx.jsx({})
        });

        const res = await app.fetch(new Request("http://localhost/override"));
        expect(await res.text()).toBe("route");
    });
});
