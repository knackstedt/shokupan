
import { describe, expect, it } from "bun:test";
import * as Index from "./index";

describe("Index Exports", () => {
    it("should export core components", () => {
        expect(Index.Shokupan).toBeDefined();
        expect(Index.ShokupanRouter).toBeDefined();
        expect(Index.ShokupanContext).toBeDefined();
    });

    it("should export util components", () => {
        expect(Index.Controller).toBeDefined(); // Decorator
        expect(Index.Container).toBeDefined(); // DI
    });

    it("should export plugins", () => {
        // middleware plugins might be exported as factory functions or classes
        // Assuming 'compression' is exported
        // expect(Index.compression).toBeDefined(); // or similar
        // Let's check generally available ones
        // AuthPlugin is exported
        expect(Index.AuthPlugin).toBeDefined();
    });
});
