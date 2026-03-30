

import { describe, expect, test } from "bun:test";
import { Get } from './decorators/http';

import { ShokupanRouter } from './router';
import { Shokupan } from './shokupan';

class MyController {
    @Get('/hello')
    hello() { return 'world'; }
}

describe("Controller and Router Interoperability", () => {

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
