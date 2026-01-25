
import { describe, expect, test } from "bun:test";
import { Injectable } from "./decorators";
import { Container } from "./di";

describe("DI Reliability", () => {

    test("should detect circular dependencies and throw error", () => {
        // Forward declaration trick not needed if we define classes inside test scope
        // but `class` is block scoped.

        // We need to define them such that they refer to each other.
        // But TS decorators resolve at definition time? No, resolve happens at Container time.
        // But referencing the class before definition in `constructor` types might be tricky in pure TS inside a function?
        // Let's use `any` or abstract classes or just assume runtime resolution works if TS compiles.

        @Injectable("singleton")
        class ServiceA {
            constructor(public b: any) { }
        }

        @Injectable("singleton")
        class ServiceB {
            constructor(public a: ServiceA) { }
        }

        // We have to patch ServiceA's constructor param manually because 'ServiceB' wasn't defined yet?
        // Actually, let's use manual resolving via metadata patch to simulate the cycle 
        // if TS prevents us from writing the circular type reference easily in a single file block.
        // OR rely on runtime `Reflect.defineMetadata`.

        Reflect.defineMetadata("design:paramtypes", [ServiceB], ServiceA);
        // design:paramtypes for ServiceB is already [ServiceA] (correctly captured by decorator)

        expect(() => {
            Container.resolve(ServiceA);
        }).toThrow("Circular dependency detected");
    });

    test("should call onInit when instantiated", () => {
        let initialized = false;

        @Injectable("instanced")
        class InitService {
            onInit() {
                initialized = true;
            }
        }

        Container.resolve(InitService);
        expect(initialized).toBe(true);
    });

    test("should call onDestroy on teardown for singletons", async () => {
        let destroyed = false;

        @Injectable("singleton")
        class DestroyService {
            onDestroy() {
                destroyed = true;
            }
        }

        // Must resolve to create the singleton
        Container.resolve(DestroyService);

        await Container.teardown();
        expect(destroyed).toBe(true);
    });
});
