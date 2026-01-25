
import { describe, expect, it } from "bun:test";
import { renderStatusView } from "./status";

describe("Status View Template", () => {
    it("should render status view", () => {
        const html = renderStatusView({
            url: { pathname: "/" },
            method: "GET"
        } as any, 404, {
            message: "Not Found"
        } as Error);
        expect(html).toContain("404");
    });
});
