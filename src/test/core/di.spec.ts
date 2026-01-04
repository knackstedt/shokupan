
import { describe, expect, test } from "bun:test";
import { Controller, Get } from '../../decorators';
import { Container, Inject, Injectable } from '../../di';
import { Shokupan } from '../../shokupan';

// --- Test Fixtures ---

@Injectable()
class DatabaseService {
    public id = Math.random();
    public data = new Map<string, string>();
}

@Injectable()
class ConfigService {
    constructor() { }
    get(key: string) { return "value"; }
}

@Injectable()
class UserService {
    // Property Injection
    @Inject(DatabaseService)
    public db!: DatabaseService;

    // Property Injection
    @Inject(ConfigService)
    public config!: ConfigService;

    createUser(name: string) {
        this.db.data.set("user", name);
        return { name, dbId: this.db.id };
    }
}

// Circular Dependency Test (might fail with simple implementation, but good to know)
class ServiceA {
    @Inject(() => ServiceB) // Lazy resolve if we supported it, current impl doesn't support thunks
    public b!: any;
}
class ServiceB {
    @Inject(() => ServiceA)
    public a!: any;
}


// --- Test Suite ---

describe("Dependency Injection System", () => {
    // Reset container for isolation if we exposed a clear method?
    // Current Container is static global. We can't easily reset it without adding a method.
    // For now we assume state persists or we use new classes.

    test("should resolve singleton instances by default", () => {
        const db1 = Container.resolve(DatabaseService);
        const db2 = Container.resolve(DatabaseService);

        expect(db1).toBeDefined();
        expect(db1).toBe(db2);
        expect(db1.id).toBe(db2.id);
    });

    test("should support manual registration", () => {
        class MockDb extends DatabaseService {
            public override id = 999;
        }

        // We can't overwrite easily in current impl if already resolved above.
        // Let's use a fresh token.
        class ManualService { }
        const instance = new ManualService();
        Container.register(ManualService, instance);

        expect(Container.resolve(ManualService)).toBe(instance);
    });

    test("should support nested property injection", () => {
        const userScope = Container.resolve(UserService);

        expect(userScope.db).toBeDefined();
        expect(userScope.config).toBeDefined();

        // Singleton check across graph
        const directDb = Container.resolve(DatabaseService);
        expect(userScope.db).toBe(directDb);
    });

    test("DI in Controllers", async () => {
        @Controller("/di-test")
        class TestController {
            @Inject(UserService)
            private user!: UserService;

            @Get("/")
            test() {
                return {
                    dbId: this.user.db.id,
                    hasConfig: !!this.user.config
                };
            }
        }

        const app = new Shokupan();
        app.mount("/api", TestController);

        const res = await app.testRequest({ path: "/api/di-test" });
        const db = Container.resolve(DatabaseService);

        expect(res.data).toEqual({
            dbId: db.id,
            hasConfig: true
        });
    });

    test("should handle multiple separate controllers sharing state", async () => {
        @Controller("/c1")
        class ControllerOne {
            @Inject(DatabaseService) public db!: DatabaseService;
            @Get("/") setVal() { this.db.data.set("shared", "state"); return "ok"; }
        }

        @Controller("/c2")
        class ControllerTwo {
            @Inject(DatabaseService) public db!: DatabaseService;
            @Get("/") getVal() { return this.db.data.get("shared"); }
        }

        const app = new Shokupan();
        app.mount("/", ControllerOne);
        app.mount("/", ControllerTwo);

        await app.testRequest({ path: "/c1" });
        const res = await app.testRequest({ path: "/c2" });

        expect(res.data).toBe("state");
    });
});
