

import { describe, expect, test } from "bun:test";
import { Get } from './decorators/http';

import { ShokupanRouter } from './router';
import { Shokupan } from './shokupan';

class MyController {
    @Get('/hello')
    hello() { return 'world'; }
}

describe("Controller Enforcement", () => {

    describe("Default Behavior (controllersOnly: false)", () => {
        test("should accept Controller Constructor", () => {
            const app = new Shokupan();
            expect(() => app.mount('/c', MyController)).not.toThrow();
        });

        test("should accept Controller Instance", () => {
            const app = new Shokupan();
            const instance = new MyController();
            expect(() => app.mount('/i', instance)).not.toThrow();
        });

        test("should accept Plain Object (as instance)", () => {
            const app = new Shokupan();
            const obj = {
                getTest: () => 'test'
            };
            expect(() => app.mount('/o', obj)).not.toThrow();
        });

        test("should accept Router Instance", () => {
            const app = new Shokupan();
            const router = new ShokupanRouter();
            expect(() => app.mount('/r', router)).not.toThrow();
        });
    });

    describe("Strict Behavior (controllersOnly: true)", () => {
        test("should accept Controller Constructor", () => {
            const app = new Shokupan({ controllersOnly: true });
            expect(() => app.mount('/c', MyController)).not.toThrow();
        });

        test("should REJECT Controller Instance", () => {
            const app = new Shokupan({ controllersOnly: true });
            const instance = new MyController();
            expect(() => app.mount('/i', instance)).toThrow(/strict controller check failed/);
        });

        test("should REJECT Plain Object", () => {
            const app = new Shokupan({ controllersOnly: true });
            const obj = {
                getTest: () => 'test'
            };
            expect(() => app.mount('/o', obj)).toThrow(/strict controller check failed/);
        });

        test("should accept Router Instance", () => {
            // Routers should still be allowed as they are fundamental for sub-routing
            const app = new Shokupan({ controllersOnly: true });
            const router = new ShokupanRouter();
            expect(() => app.mount('/r', router)).not.toThrow();
        });
    });
});
