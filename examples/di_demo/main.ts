
import { Inject, Use } from '../../src/decorators';
import { Shokupan } from "../../src/shokupan";

// 1. Singleton Service (Shared)
@Inject("singleton")
class DatabaseService {
    public id = crypto.randomUUID();
    private db = new Map<string, any>();

    constructor() {
        console.log(`[DatabaseService] Initialized (ID: ${this.id})`);
        this.db.set("user:1", { name: "Alice" });
    }

    getUser(id: string) {
        return this.db.get(id);
    }
}

// 2. Instanced Service (Transient)
@Inject("instanced")
class RequestIdService {
    public id = crypto.randomUUID();

    constructor() {
        console.log(`[RequestIdService] Initialized (ID: ${this.id})`);
    }
}

// 3. Service with Dependency (Constructor Injection)
@Inject("singleton")
class UserService {
    // DatabaseService is automatically injected
    constructor(private db: DatabaseService) { }

    findUser(id: string) {
        return this.db.getUser(id);
    }
}

@Controller("/demo")
class DemoController {

    // 4. Property Injection
    @Use(UserService)
    private userService;

    // 5. Constructor Injection (Controller)
    constructor(
        // Injecting instanced service - will happen once when Controller is instantiated
        // Note: Controllers are currently Singletons in Shokupan by default unless handled otherwise,
        // so this RequestIdService will actually be tied to the Controller instance lifetime.
        private requestId: RequestIdService
    ) { }

    @Get("/user")
    getUser() {
        // Access property-injected service
        const user = this.userService.findUser("user:1");
        return {
            user,
            controllerRequestId: this.requestId.id
        };
    }

    // 6. Method Parameter Injection
    // This allows resolving a NEW instance for the specific request handler execution
    @Get("/dynamic")
    getDynamic(@Use(RequestIdService) reqId: RequestIdService) {
        return {
            msg: "New Request ID generated for this call",
            id: reqId.id
        };
    }
}

const app = new Shokupan({
    port: 3000
});


// Shokupan auto-discovers controllers, but here we run it.
// Assuming ControllerScanner picks this up if we mount it or let it run.
// For manual registration demonstration:
// In current Shokupan, simply defining the class with decorators usually registers it if imported.

async function main() {
    // Manually register if needed or just start
    // Note: In typical usage, 'routes' are scanned.
    // For this standalone example, we might need to manually mount if auto-scan isn't setup for this file.
    // But Shokupan's pattern is often global registration side-effects or directory scanning.

    // Let's use the explicit scan helper for this example to be safe
    const { ControllerScanner } = await import("../../src/util/controller-scanner");
    ControllerScanner.scan(app as any, "/", new DemoController(new RequestIdService()));

    // Note: Constructor injection for ROOT controller manual instantiation needs manual handling here
    // OR we rely on a factory that uses DI. 
    // Shokupan's router currently takes instances.
    // Future improvement: app.register(DemoController) to handle root resolving.

    console.log("Starting DI Demo Server on http://localhost:3000");
    await app.listen();
}

main();
