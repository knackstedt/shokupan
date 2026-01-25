
import { describe, expect, it } from "bun:test";
import { renderErrorView } from "./error";

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
});
