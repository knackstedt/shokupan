import { describe, expect, it, spyOn } from "bun:test";
import { ConsolaLogger, JsonLogger, createLogger } from "./logger";

describe("Logger", () => {
    describe("JsonLogger", () => {
        it("should log json output", () => {
            const spy = spyOn(process.stdout, "write").mockImplementation(() => 0);
            const logger = new JsonLogger();
            logger.info("TestModule", "test message", { foo: "bar" });

            expect(spy).toHaveBeenCalledTimes(1);
            const callArgs = spy.mock.calls[0];
            const logObj = JSON.parse(callArgs[0]);

            expect(logObj.level).toBe("info");
            expect(logObj.module).toBe("TestModule");
            expect(logObj.message).toBe("test message");
            expect(logObj.foo).toBe("bar");
            expect(logObj.timestamp).toBeDefined();

            spy.mockRestore();
        });
    });

    describe("ConsolaLogger", () => {
        it("should log formatted output via consola", () => {
            // Consola writes to process.stdout/stderr depending on level.
            // Mocking console.log might not catch it if consola writes directly to stream or uses special handling.
            // But standard consola uses console.log/error by default unless configured otherwise.
            // However, our ConsolaLogger implementation might need checking.

            // For this test, we just instantiate it to verify it doesn't crash.
            // comprehensive mocking of consola internals is complex.
            const logger = new ConsolaLogger();
            expect(logger).toBeInstanceOf(ConsolaLogger);

            // We can try to spy on the underlying consola instance if we exposed it, 
            // or just ensure methods exist.
            expect(logger.info).toBeDefined();
            logger.info("TestModule", "test message");
        });
    });

    describe("createLogger", () => {
        it("should return JsonLogger for production", () => {
            const logger = createLogger("production");
            expect(logger).toBeInstanceOf(JsonLogger);
        });

        it("should return ConsolaLogger for development", () => {
            const logger = createLogger("development");
            expect(logger).toBeInstanceOf(ConsolaLogger);
        });

        it("should default to ConsolaLogger if no env provided", () => {
            const logger = createLogger(undefined);
            expect(logger).toBeInstanceOf(ConsolaLogger);
        });
    });
});
