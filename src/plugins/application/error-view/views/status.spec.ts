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
        expect(html).toContain("Oops! Missing Ingredient");
        expect(html).toContain("missing-ingredient.webp");
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
        expect(html).not.toContain("Oops! Missing Ingredient");
        expect(html).not.toContain("missing-ingredient.webp");
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
});
