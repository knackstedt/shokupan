
import { describe, expect, test } from "bun:test";
import { Inject, Injectable } from "./decorators";
import { Container } from "./di";

describe("Dependency Injection", () => {
    test("should support manual registration", () => {
        class Service {
            value = "manual";
        }
        Container.register(Service, new Service());
        const instance = Container.resolve(Service);
        expect(instance).toBeDefined();
        expect(instance.value).toBe("manual");
    });

    test("should support constructor injection", () => {
        @Injectable()
        class Dependency {
            value = "injected";
        }

        @Injectable()
        class Service {
            constructor(public dep: Dependency) { }
        }

        const service = Container.resolve(Service);
        expect(service).toBeDefined();
        expect(service.dep).toBeDefined();
        expect(service.dep.value).toBe("injected");
    });

    test("should support property injection", () => {
        @Injectable()
        class Dependency {
            value = "prop-injected";
        }

        class Service {
            @Inject(Dependency)
            public dep!: Dependency;
        }

        const service = new Service();
        expect(service.dep).toBeDefined();
        expect(service.dep.value).toBe("prop-injected");
    });
});
