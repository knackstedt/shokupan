import { describe, expect, test } from "bun:test";
import { ShokupanContext } from "./context";
import { ShokupanRequest } from "./util/request";
import { type EmptyState, getStateProperty, hasStateProperty, requireStateProperty } from "./util/types";

describe("State Type Utilities", () => {
    describe("hasStateProperty", () => {
        test("should return true for existing property", () => {
            const state = { userId: "123", count: 0 };

            expect(hasStateProperty(state, "userId")).toBe(true);
            expect(hasStateProperty(state, "count")).toBe(true);
        });

        test("should return false for missing property", () => {
            const state = { userId: "123" };

            expect(hasStateProperty(state, "missing")).toBe(false);
        });

        test("should return false for undefined property", () => {
            const state = { userId: undefined };

            expect(hasStateProperty(state, "userId")).toBe(false);
        });

        test("should provide type narrowing", () => {
            interface MyState {
                userId?: string;
                count?: number;
            }

            const state: MyState = { userId: "123" };

            if (hasStateProperty(state, "userId")) {
                // TypeScript should know userId exists here
                const id: string = state.userId;
                expect(id).toBe("123");
            }
        });
    });

    describe("requireStateProperty", () => {
        test("should not throw for existing property", () => {
            const state = { userId: "123" };

            expect(() => requireStateProperty(state, "userId")).not.toThrow();
        });

        test("should throw for missing property", () => {
            const state = { userId: "123" };

            expect(() => requireStateProperty(state, "missing" as any)).toThrow(
                'Required state property "missing" is not set'
            );
        });

        test("should throw for null property", () => {
            const state = { userId: null };

            expect(() => requireStateProperty(state, "userId")).toThrow(
                'Required state property "userId" is not set'
            );
        });

        test("should accept custom error message", () => {
            const state = { userId: undefined };

            expect(() =>
                requireStateProperty(state, "userId", "User ID is required")
            ).toThrow("User ID is required");
        });

        test("should work with assertion signature", () => {
            interface MyState {
                userId?: string;
            }

            const state: MyState = { userId: "123" };

            // Before assertion, userId might be undefined
            const before: string | undefined = state.userId;
            expect(before).toBe("123");

            // After assertion, TypeScript knows userId exists
            requireStateProperty(state, "userId");
            const after: string = state.userId; // No error!
            expect(after).toBe("123");
        });
    });

    describe("getStateProperty", () => {
        test("should return property value if exists", () => {
            const state = { userId: "123", count: 42 };

            expect(getStateProperty(state, "userId")).toBe("123");
            expect(getStateProperty(state, "count")).toBe(42);
        });

        test("should return undefined for missing property without default", () => {
            const state = { userId: "123" };

            expect(getStateProperty(state, "missing" as any)).toBeUndefined();
        });

        test("should return default value for missing property", () => {
            const state = { userId: "123" };

            expect(getStateProperty(state, "missing" as any, "default")).toBe("default");
            expect(getStateProperty(state, "count" as any, 0)).toBe(0);
        });

        test("should return default value for undefined property", () => {
            const state = { userId: undefined };

            expect(getStateProperty(state, "userId", "anonymous")).toBe("anonymous");
        });

        test("should work with different default types", () => {
            const state = { count: undefined };

            expect(getStateProperty(state, "count", 0)).toBe(0);
            expect(getStateProperty(state, "count", "zero")).toBe("zero");
            expect(getStateProperty(state, "count", null)).toBe(null);
        });
    });

    describe("EmptyState type", () => {
        test("should prevent property access on empty state", () => {
            // This test validates TypeScript compilation behavior
            // EmptyState = Record<string, never> prevents any property assignment

            const req = new ShokupanRequest({
                method: "GET",
                url: "http://localhost/test"
            });

            const ctx = new ShokupanContext<EmptyState>(req);

            // At runtime, state is an empty object
            expect(ctx.state).toEqual({});

            // TypeScript would error if you try: ctx.state.anything = 'value'
            // We can't test compile errors in runtime tests, but this documents the intent
        });
    });

    describe("Real-world usage patterns", () => {
        interface AppState {
            userId?: string;
            requestId: string;
            permissions?: string[];
        }

        test("should work with optional state properties", () => {
            const req = new ShokupanRequest({
                method: "GET",
                url: "http://localhost/test"
            });

            const ctx = new ShokupanContext<AppState>(req);

            // Required property should be set
            ctx.state.requestId = "req-123";
            expect(ctx.state.requestId).toBe("req-123");

            // Optional properties can be checked safely
            if (hasStateProperty(ctx.state, "userId")) {
                expect(typeof ctx.state.userId).toBe("string");
            } else {
                expect(ctx.state.userId).toBeUndefined();
            }
        });

        test("should allow safe property access with guards", () => {
            const req = new ShokupanRequest({
                method: "GET",
                url: "http://localhost/test"
            });

            const ctx = new ShokupanContext<AppState>(req);
            ctx.state.requestId = "req-123";

            // Using type guard
            const userId = hasStateProperty(ctx.state, "userId")
                ? ctx.state.userId
                : "anonymous";
            expect(userId).toBe("anonymous");

            // Using getter with default
            const permissions = getStateProperty(ctx.state, "permissions", []);
            expect(permissions).toEqual([]);
        });

        test("should enforce required properties with assertions", () => {
            const req = new ShokupanRequest({
                method: "GET",
                url: "http://localhost/test"
            });

            const ctx = new ShokupanContext<AppState>(req);
            ctx.state.requestId = "req-123";
            ctx.state.userId = "user-456";

            // This should not throw
            requireStateProperty(ctx.state, "userId");
            requireStateProperty(ctx.state, "requestId");

            // After assertion, we can safely access
            const userId: string = ctx.state.userId;
            expect(userId).toBe("user-456");
        });
    });
});
