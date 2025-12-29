import { Type } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import Ajv from "ajv";
import { describe, expect, it } from "bun:test";
import * as v from "valibot";
import { z } from "zod";

import { valibot, validate } from "../../plugins/validation";
import { Shokupan } from "../../shokupan";

describe("Validation Plugin", () => {

    it("should validate body using Zod", async () => {
        const app = new Shokupan();
        const schema = z.object({
            name: z.string(),
            age: z.number()
        });

        app.post("/zod",
            validate({ body: schema }),
            async (ctx) => {
                const body = await ctx.req.json();
                return { success: true, data: body };
            }
        );

        // Valid Request
        const req1 = new Request("http://localhost/zod", {
            method: "POST",
            body: JSON.stringify({ name: "Alice", age: 30 }),
            headers: { "content-type": "application/json" }
        });
        const res1 = await app.fetch(req1);
        expect(res1.status).toBe(200);
        expect(await res1.json()).toEqual({ success: true, data: { name: "Alice", age: 30 } });

        // Invalid Request
        const req2 = new Request("http://localhost/zod", {
            method: "POST",
            body: JSON.stringify({ name: "Alice", age: "30" }), // age should be number
            headers: { "content-type": "application/json" }
        });
        const res2 = await app.fetch(req2);
        expect(res2.status).toBe(400);
        const err = await res2.json();
        expect(err.error).toBe("Validation Error");
    });

    it("should validate body using Ajv", async () => {
        const app = new Shokupan();
        const ajv = new Ajv();
        const schema = {
            type: "object",
            properties: {
                id: { type: "integer" }
            },
            required: ["id"],
            additionalProperties: false
        };
        const validator = ajv.compile(schema);

        app.post("/ajv",
            validate({ body: validator }),
            async (ctx) => {
                return { success: true };
            }
        );

        // Valid
        const res1 = await app.fetch(new Request("http://localhost/ajv", {
            method: "POST",
            body: JSON.stringify({ id: 123 }),
            headers: { "content-type": "application/json" }
        }));
        expect(res1.status).toBe(200);

        // Invalid
        const res2 = await app.fetch(new Request("http://localhost/ajv", {
            method: "POST",
            body: JSON.stringify({ id: "123" }),
            headers: { "content-type": "application/json" }
        }));
        expect(res2.status).toBe(400);
    });

    it("should validate body using TypeBox (Computed)", async () => {
        const app = new Shokupan();
        const schema = Type.Object({
            email: Type.String()
        });
        // TypeBox validation usually requires compilation for Check method
        const C = TypeCompiler.Compile(schema);

        app.post("/typebox",
            validate({ body: C }),
            async (ctx) => {
                return { success: true };
            }
        );

        // Valid
        // Note: 'email' format might vary by environment/ajv version usually, 
        // TypeBox default checking is simple? check doc. 
        // TypeBox default compiler supports formats? 
        // TypeBox.String() without format is safer.
        // Let's use simple string.
        const res1 = await app.fetch(new Request("http://localhost/typebox", {
            method: "POST",
            body: JSON.stringify({ email: "test@example.com" }),
            headers: { "content-type": "application/json" }
        }));
        expect(res1.status).toBe(200);

        // Invalid (missing field)
        const res2 = await app.fetch(new Request("http://localhost/typebox", {
            method: "POST",
            body: JSON.stringify({}),
            headers: { "content-type": "application/json" }
        }));
        expect(res2.status).toBe(400);
    });

    it("should validate body using Valibot", async () => {
        const app = new Shokupan();
        const schema = v.object({
            role: v.string()
        });

        // Use wrapper
        const validator = valibot(schema, v.safeParseAsync);

        app.post("/valibot",
            validate({ body: validator }),
            async (ctx) => {
                return { success: true };
            }
        );

        // Valid
        const res1 = await app.fetch(new Request("http://localhost/valibot", {
            method: "POST",
            body: JSON.stringify({ role: "admin" }),
            headers: { "content-type": "application/json" }
        }));
        expect(res1.status).toBe(200);

        // Invalid
        const res2 = await app.fetch(new Request("http://localhost/valibot", {
            method: "POST",
            body: JSON.stringify({ role: 123 }),
            headers: { "content-type": "application/json" }
        }));
        expect(res2.status).toBe(400);
    });

    it("should allow handler to read body after validation", async () => {
        const app = new Shokupan();
        const schema = z.object({ foo: z.string() });

        app.post("/read-twice",
            validate({ body: schema }),
            async (ctx) => {
                // Should not fail due to locked stream
                const body = await ctx.req.json();
                return { foo: body.foo };
            }
        );

        const req = new Request("http://localhost/read-twice", {
            method: "POST",
            body: JSON.stringify({ foo: "bar" }),
            headers: { "content-type": "application/json" }
        });

        const res = await app.fetch(req);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ foo: "bar" });
    });

    it("should support transformation (Zod coercion)", async () => {
        const app = new Shokupan();
        const schema = z.object({
            count: z.string().transform(val => parseInt(val, 10))
        });

        app.post("/transform",
            validate({ body: schema }),
            async (ctx) => {
                const body = await ctx.req.json();
                return { countType: typeof body.count, count: body.count };
            }
        );

        const res = await app.fetch(new Request("http://localhost/transform", {
            method: "POST",
            body: JSON.stringify({ count: "42" }),
            headers: { "content-type": "application/json" }
        }));

        expect(res.status).toBe(200);
        // Zod transform should modify the data returned by ctx.req.json()
        expect(await res.json()).toEqual({ countType: "number", count: 42 });
    });

    it("should validate params", async () => {
        const app = new Shokupan();
        const schema = z.object({
            id: z.string().regex(/^\d+$/)
        });

        app.get("/user/:id",
            validate({ params: schema }),
            async (ctx) => {
                return { id: ctx.params.id };
            }
        );

        // Valid
        const res1 = await app.fetch(new Request("http://localhost/user/123"));
        expect(res1.status).toBe(200);

        // Invalid
        const res2 = await app.fetch(new Request("http://localhost/user/abc"));
        expect(res2.status).toBe(400);
    });
});
