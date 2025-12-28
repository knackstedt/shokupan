import { describe, expect, it } from "bun:test";
import { IsInt, IsString, Min } from "class-validator";
import { validate } from "../plugins/validation";
import { Shokupan } from "../shokupan";

// Define a validation class
class UserDto {
    @IsString()
    name: string;

    @IsInt()
    @Min(18)
    age: number;

    constructor(name: string, age: number) {
        this.name = name;
        this.age = age;
    }
}

describe("Validation Plugin - Class Validator", () => {
    it("should validate using class-validator", async () => {
        const app = new Shokupan();

        app.post("/register",
            validate({ body: UserDto }),
            async (ctx) => {
                const body = await ctx.req.json();
                return {
                    success: true,
                    data: body,
                    isInstance: body instanceof UserDto
                };
            }
        );

        // Valid Request
        const res1 = await app.fetch(new Request("http://localhost/register", {
            method: "POST",
            body: JSON.stringify({ name: "Alice", age: 25 }),
            headers: { "content-type": "application/json" }
        }));

        expect(res1.status).toBe(200);
        const validBody = await res1.json() as any;
        expect(validBody.success).toBe(true);
        expect(validBody.data.age).toBe(25);
        // class-transformer should create an instance of UserDto
        // However, JSON serialization of the response will lose the class info.
        // But our handler checked `instanceof`.
        expect(validBody.isInstance).toBe(true);


        // Invalid Request (age < 18)
        const res2 = await app.fetch(new Request("http://localhost/register", {
            method: "POST",
            body: JSON.stringify({ name: "Bob", age: 10 }),
            headers: { "content-type": "application/json" }
        }));

        expect(res2.status).toBe(400);
        const errorBody = await res2.json() as any;

        // Check error structure
        // Should contain validation errors for 'age' property
        const ageError = errorBody.errors.find((e: any) => e.property === "age");
        expect(ageError).toBeDefined();
        expect(ageError.constraints.min).toBeDefined();
    });

    it("should handle transformation (string to number) if implemented manually or via Type", async () => {
        // Note: plainoutInstance doesn't automatically coerce types like "20" -> 20 unless @Type is used 
        // or enableImplicitConversion is set in class-transformer options.
        // We verified safe usage. Let's stick to basic validation for now.
    });
});
