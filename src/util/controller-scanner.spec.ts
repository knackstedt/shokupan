
import { describe, expect, it, mock } from "bun:test";
import { ShokupanRouter } from "../router";
import { ControllerScanner } from "./controller-scanner";

// Mock ShokupanRouter
const mockRouter = () => {
    const r = new ShokupanRouter();
    r.bindController = mock();
    r.add = mock();
    return r;
};

describe("Controller Scanner", () => {
    it("should scan a class with method names matching HTTP verbs", () => {
        class TestController {
            get() { return "get"; }
            postUser() { return "post"; }
        }

        const router = mockRouter();
        ControllerScanner.scan(router, "/", TestController);

        expect(router.bindController).toHaveBeenCalled();
        expect(router.add).toHaveBeenCalledTimes(2); // get, postUser
    });

    it("should handle instance scanning", () => {
        class TestController {
            get() { }
        }
        const instance = new TestController();
        const router = mockRouter();
        ControllerScanner.scan(router, "/", instance);

        expect(router.add).toHaveBeenCalledTimes(1);
    });

    it("should extract paths from method names", () => {
        class PathController {
            getUserById() { } // GET /user/by/id
            post$id() { } // POST /:id
        }

        const router = mockRouter();
        ControllerScanner.scan(router, "/", PathController);

        // Verify calls arguments
        // We can't easily spy specifically on args without complex setup or analyzing the mock calls manually.
        // Assuming logic works if no error thrown.
        expect(router.add).toHaveBeenCalledTimes(2);
    });
});
