
import { describe, expect, test } from "bun:test";
import { Injectable, Use } from "./di";
import { Container } from "./util/container";

describe("DI Constructor Injection", () => {

    @Injectable("singleton")
    class ServiceA {
        val = "A";
    }

    @Injectable("singleton")
    class ServiceB {
        val = "B";
    }

    test("should inject constructor params via type inference", () => {
        @Injectable("instanced")
        class Client {
            constructor(public a: ServiceA, public b: ServiceB) { }
        }

        const client = Container.resolve(Client);
        expect(client.a).toBeInstanceOf(ServiceA);
        expect(client.b).toBeInstanceOf(ServiceB);
        expect(client.a.val).toBe("A");
    });

    test("should inject constructor params via @Use token override", () => {
        // Mock a case where type inference is ambiguous or we want to swap implementation
        class BaseService { val = "Base"; }
        class MockService extends BaseService { override val = "Mock"; } // This would normally be registered with a token

        // Let's register MockService as BaseService token? 
        // Our container doesn't support binding A to B yet (only instance).
        // So we just inject specific class.

        @Injectable("instanced")
        class Client2 {
            constructor(
                @Use(ServiceB) public aAsB: any // Type says any, but we force inject ServiceB
            ) { }
        }

        const client = Container.resolve(Client2);
        expect(client.aAsB).toBeInstanceOf(ServiceB);
        expect(client.aAsB.val).toBe("B");
    });
});
