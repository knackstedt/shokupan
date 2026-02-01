import { describe, expect, it } from "bun:test";
import { renderStatusView } from "./status.tsx";

describe("Status View Template", () => {
    it("should render 404 with missing ingredient theme", () => {
        const html = renderStatusView({
            url: { pathname: "/missing-page" },
            method: "GET"
        } as any, 404, {
            message: "Not Found"
        } as Error);

        expect(html).toContain("404");
        expect(html).toContain("We searched high and low");
        expect(html).toContain("404.webp");
        expect(html).toContain("bread-image");
    });

    it("should show generic page for non-404 errors", () => {
        const html = renderStatusView({
            url: { pathname: "/forbidden" },
            method: "GET"
        } as any, 403, {
            message: "Forbidden"
        } as Error);

        expect(html).toContain("403");
        expect(html).toContain("Forbidden");
        expect(html).toContain("Forbidden");
        expect(html).not.toContain("We searched high and low");
        expect(html).toContain("403.webp");
    });

    it("should escape HTML in paths", () => {
        const html = renderStatusView({
            url: { pathname: "/<script>alert(1)</script>" },
            method: "GET"
        } as any, 404, {
            message: "Not Found"
        } as Error);

        expect(html).not.toContain("<script>alert(1)</script>");
        expect(html).toContain("&lt;script");
    });

    it("should display request method and path", () => {
        const html = renderStatusView({
            url: { pathname: "/api/users" },
            method: "POST"
        } as any, 404, {
            message: "Not Found"
        } as Error);

        expect(html).toContain("POST");
        expect(html).toContain("/api/users");
    });


    it("should display request ID", () => {
        const html = renderStatusView({
            url: { pathname: "/test" },
            method: "GET"
        } as any, 500, new Error("Boom"), { requestId: "req-123" });

        expect(html).toContain("req-123");
    });

    it("should hide error message when configured", () => {
        const html = renderStatusView({
            url: { pathname: "/test" },
            method: "GET"
        } as any, 500, new Error("Secret Error"), { hideErrorMessage: true });

        expect(html).not.toContain("Secret Error");
        expect(html).toContain("500");
    });
});
