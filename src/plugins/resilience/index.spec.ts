
import { describe, expect, it } from "bun:test";
import * as Resilience from "./index";

describe("Resilience Index", () => {
    it("should export factories and decorators", () => {
        expect(Resilience.ResilienceFactory).toBeDefined();
        expect(Resilience.Retry).toBeDefined();
        expect(Resilience.CircuitBreaker).toBeDefined();
    });
});
