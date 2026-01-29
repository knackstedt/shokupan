import { describe, expect, it, spyOn } from "bun:test";
import { JsonLogger, PrettyLogger, createLogger } from "./logger";

describe("Logger", () => {
    describe("JsonLogger", () => {
        it("should log json output", () => {
            const spy = spyOn(console, "log").mockImplementation(() => { });
            const logger = new JsonLogger();
            logger.info("test message", { foo: "bar" });

            expect(spy).toHaveBeenCalledTimes(1);
            const callArgs = spy.mock.calls[0];
            const logObj = JSON.parse(callArgs[0]);

            expect(logObj.level).toBe("info");
            expect(logObj.message).toBe("test message");
            expect(logObj.foo).toBe("bar");
            expect(logObj.timestamp).toBeDefined();

            spy.mockRestore();
        });
    });

    describe("PrettyLogger", () => {
        it("should log formatted output", () => {
            const spy = spyOn(console, "log").mockImplementation(() => { });
            const logger = new PrettyLogger();
            logger.info("test message", { foo: "bar" });

            expect(spy).toHaveBeenCalledTimes(1);
            const output = spy.mock.calls[0][0];

            expect(output).toContain("[INFO]");
            expect(output).toContain("test message");
            // The props formatting adds newlines and indentation
            expect(spy.mock.calls[0][0]).toContain("foo: bar"); // simplified check as props are appended

            spy.mockRestore();
        });
    });

    describe("createLogger", () => {
        it("should return JsonLogger for production", () => {
            const logger = createLogger("production");
            expect(logger).toBeInstanceOf(JsonLogger);
        });

        it("should return PrettyLogger for development", () => {
            const logger = createLogger("development");
            expect(logger).toBeInstanceOf(PrettyLogger);
        });

        it("should default to PrettyLogger if no env provided (assuming default dev)", () => {
            // In test env, it might vary, but let's check explicit default
            const logger = createLogger(undefined);
            // Based on implementation: env || 'development'
            expect(logger).toBeInstanceOf(PrettyLogger);
        });
    });
});
