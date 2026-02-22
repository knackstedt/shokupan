import { expect, test } from "bun:test";
test("basic", () => {
    console.log("NODE_ENV:", process.env.NODE_ENV);
    expect(1 + 1).toBe(2);
});
