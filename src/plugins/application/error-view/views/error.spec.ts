import { describe, expect, it } from "bun:test";
import { renderErrorView } from "./error.tsx";

describe("Error View Template", () => {
    it("should render error view", async () => {
        const html = await renderErrorView({
            method: "GET",
            url: { pathname: "/" },
            headers: new Map(),
            params: {},
            query: {},
            response: { status: 500 }
        } as any, {
            message: "Error",
            stack: "Stack"
        });
        expect(html).toContain("Error");
    });

    it("should escape XSS in error message", async () => {
        const malicious = "<script>alert(1)</script>";
        const html = await renderErrorView({
            method: "GET",
            url: { pathname: "/" },
            headers: new Map(),
            params: {},
            query: {},
            response: { status: 500 },
        } as any, {
            message: malicious,
            stack: "Stack"
        });
        // Should not contain unescaped malicious code
        expect(html).not.toContain(malicious);
        // Should escape the opening tag (Preact escapes < to &lt;)
        expect(html).toContain("&lt;script");
        expect(html).toContain("&lt;/script");
    });

    it("should escape XSS in query params", async () => {
        const html = await renderErrorView({
            method: "GET",
            url: { pathname: "/" },
            headers: new Map(),
            params: {},
            query: { q: "<img src=x onerror=alert(1)>" },
            response: { status: 500 }
        } as any, {
            message: "Error",
            stack: "Stack"
        });
        // Should not contain unescaped malicious code  
        expect(html).not.toContain("<img src=x onerror=alert(1)>");
        // Should escape the opening tag (Preact escapes < to &lt;)
        expect(html).toContain("&lt;img");
    });

    it("should hide code when configured", async () => {
        const error = new Error("Test Error");
        const html = await renderErrorView({
            url: { pathname: "/error" },
            method: "GET",
            requestId: "req-1",
            headers: new Map(),
            response: { status: 500 }
        } as any, error, { hideCode: true });

        expect(html).not.toContain("CodeFigure"); // It's a component name, but in HTML it renders as <section class="figure">...
        // Better check for the HTML structure
        expect(html).not.toContain('class="figure"');
    });

    it("should hide stacktrace when configured", async () => {
        const error = new Error("Test Error");
        const html = await renderErrorView({
            url: { pathname: "/error" },
            method: "GET",
            requestId: "req-1",
            headers: new Map(),
            response: { status: 500 }
        } as any, error, { hideStacktrace: true });

        expect(html).not.toContain("Stack Trace");
        expect(html).not.toContain('class="narrative"');
    });
});
