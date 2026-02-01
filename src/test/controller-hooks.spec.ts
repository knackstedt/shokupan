
import { describe, expect, spyOn, test } from "bun:test";
import { ShokupanContext } from "../context";
import { Controller, Get, OnRequestEnd, OnRequestError, OnRequestStart } from "../decorators";
import { Shokupan } from "../shokupan";

describe("Controller Hooks", () => {
    test("should execute onRequestStart, onRequestEnd hooks", async () => {
        const app = new Shokupan();
        const startSpy = spyOn(console, 'log');

        @Controller('/hooks')
        class HookController {
            public called = false;

            @OnRequestStart()
            onStart() {
                console.log('start');
            }

            @OnRequestEnd()
            onEnd() {
                console.log('end');
            }

            @Get('/test')
            test(ctx: ShokupanContext) {
                this.called = true;
                return { success: true };
            }
        }

        const controller = new HookController();
        app.mount('/', controller);

        const res = await app.testRequest({ path: '/hooks/test' });

        expect(res.status).toBe(200);
        expect(controller.called).toBe(true);
        expect(startSpy).toHaveBeenCalledWith('start');
        expect(startSpy).toHaveBeenCalledWith('end');
        startSpy.mockRestore();
    });

    test("should execute onError hook", async () => {
        const app = new Shokupan();
        const spy = spyOn(console, 'log');
        let errorCaught: any = null;

        @Controller('/hooks-error')
        class ErrorController {
            @OnRequestError()
            onError(ctx: ShokupanContext, err: any) {
                console.log('error');
                errorCaught = err;
            }

            @Get('/fail')
            fail() {
                throw new Error("Something went wrong");
            }
        }

        const controller = new ErrorController();
        app.mount('/', controller);

        const res = await app.testRequest({ path: '/hooks-error/fail' });

        expect(spy).toHaveBeenCalledWith('error');
        expect(errorCaught).toBeTruthy();
        expect(errorCaught.message).toBe("Something went wrong");
        spy.mockRestore();
    });
});
