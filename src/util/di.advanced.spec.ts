
import { describe, expect, test } from "bun:test";
import { Shokupan } from "../shokupan";
import { Controller, Get, Injectable, Use } from "./decorators";
import { Container } from "./di";

describe("Advanced Dependency Injection", () => {
    // 1. Define Services
    @Injectable("singleton")
    class SingletonService {
        id = Math.random();
    }

    @Injectable("instanced")
    class InstancedService {
        id = Math.random();
    }

    class ImplicitSingletonService {
        id = Math.random();
    }

    test("should resolve singleton service same instance", () => {
        const s1 = Container.resolve(SingletonService);
        const s2 = Container.resolve(SingletonService);
        expect(s1).toBe(s2);
    });

    test("should resolve instanced service new instance", () => {
        const s1 = Container.resolve(InstancedService);
        const s2 = Container.resolve(InstancedService);
        expect(s1).not.toBe(s2);
    });

    test("should default to singleton for implicit services", () => {
        const s1 = Container.resolve(ImplicitSingletonService);
        const s2 = Container.resolve(ImplicitSingletonService);
        expect(s1).toBe(s2);
    });

    test("should support property injection via @Use", () => {
        class MyController {
            @Use(SingletonService)
            service!: SingletonService;
        }

        const c = new MyController();
        expect(c.service).toBeDefined();
        expect(c.service).toBeInstanceOf(SingletonService);
        expect(c.service).toBe(Container.resolve(SingletonService));
    });

    test("should infer property type if supported", () => {
        class MyController {
            @Use()
            service!: SingletonService;
        }

        const c = new MyController();
        expect(c.service).toBeDefined();
        expect(c.service).toBeInstanceOf(SingletonService);
    });

    test("should support parameter injection in routes", async () => {
        @Controller("/di-test")
        class DIController {
            @Get("/singleton")
            testSingleton(@Use(SingletonService) s: SingletonService) {
                return new Response(String(s.id));
            }

            @Get("/instanced")
            testInstanced(@Use(InstancedService) s: InstancedService) {
                return new Response(String(s.id));
            }

            @Get("/inferred")
            testInferred(@Use() s: SingletonService) {
                return new Response(String(s.id));
            }
        }

        const app = new Shokupan();

        // Shokupan.register implies direct controller registration? 
        // Shokupan doesn't have .register() for controllers directly in the standard way shown in scanner?
        // Usually .bindController() on router is internal.
        // App.ts passes .listen() -> ...
        // Wait, current Shokupan API for adding controllers?
        // app.use? app.controller?
        // Looking at `controller-scanner.ts`, it's static scan.
        // Looking at `shokupan.ts`... let's check how to register a controller class.
        // Ah, typically `app.bind(Controller)` or similar?
        // Shokupan usually uses router.get/post...
        // Does Shokupan support Class Controllers at app level?
        // `controller-scanner` is used where?
        // Let's check `shokupan.ts` for controller registration methods.
        // `router.ts` has `bindController`.
        // `Shokupan` extends `ShokupanRouter`? No.
        // `Shokupan` has `public router: ShokupanRouter`.
        // `router.bindController` is what we renamed.

        // But `bindController` just pushes to `childControllers`.
        // Who calls `ControllerScanner.scan`?
        // `shokupan.ts` -> `handleRequest` -> `find`?
        // No, `scan` parses the class and adds routes to the router.
        // We need to call `ControllerScanner.scan(app.router, '/', new DIController())` or similar.
        // Or strictly: `ControllerScanner.scan(app, '/', new DIController())`.

        // Let's manually scan for the test since we are testing internal logic mostly.
        const { ControllerScanner } = await import("./controller-scanner");
        ControllerScanner.scan(app as any, "/", new DIController());

        // Test Singleton
        const res1 = await app.testRequest({ path: "/di-test/singleton" });
        const id1 = res1.data;
        const res2 = await app.testRequest({ path: "/di-test/singleton" });
        const id2 = res2.data;
        expect(id1).toBe(id2);

        // Test Instanced
        const res3 = await app.testRequest({ path: "/di-test/instanced" });
        const id3 = res3.data;
        const res4 = await app.testRequest({ path: "/di-test/instanced" });
        const id4 = res4.data;
        expect(id3).not.toBe(id4);
    });
});
