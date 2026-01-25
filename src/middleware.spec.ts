
import { describe, expect, it, mock } from "bun:test";
import { compose } from "./middleware";

describe("Middleware Composition", () => {
    it("should run middleware in order", async () => {
        const order: number[] = [];

        const m1 = async (ctx: any, next: any) => {
            order.push(1);
            await next();
            order.push(4);
        };
        const m2 = async (ctx: any, next: any) => {
            order.push(2);
            await next();
            order.push(3);
        };

        const fn = compose([m1 as any, m2 as any]);
        await fn({} as any);

        expect(order).toEqual([1, 2, 3, 4]);
    });

    it("should throw error if next() called multiple times", async () => {
        const m1 = async (ctx: any, next: any) => {
            await next();
            await next(); // Error
        };
        const fn = compose([m1 as any]);

        try {
            await fn({} as any);
            expect(true).toBe(false); // Should fail
        } catch (err: any) {
            expect(err.message).toContain("next() called multiple times");
        }
    });

    it("should catch errors in middleware", async () => {
        const m1 = async (ctx: any, next: any) => {
            throw new Error("Boom");
        };
        const fn = compose([m1 as any]);

        try {
            await fn({} as any);
        } catch (err: any) {
            expect(err.message).toBe("Boom");
        }
    });

    it("should handle empty middleware", async () => {
        const fn = compose([]);
        const next = mock();
        await fn({} as any, next);
        expect(next).toHaveBeenCalled();
    });
});
