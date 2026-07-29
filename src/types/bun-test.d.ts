declare module 'bun:test' {
    export function describe(name: string, fn: () => void | Promise<void>): void;
    export function describe(name: string, options: any, fn: () => void | Promise<void>): void;
    export function it(name: string, fn: () => void | Promise<void>): void;
    export function it(name: string, options: any, fn: () => void | Promise<void>): void;
    export function test(name: string, fn: () => void | Promise<void>): void;
    export function test(name: string, options: any, fn: () => void | Promise<void>): void;
    export function beforeAll(fn: () => void | Promise<void>): void;
    export function beforeEach(fn: () => void | Promise<void>): void;
    export function afterAll(fn: () => void | Promise<void>): void;
    export function afterEach(fn: () => void | Promise<void>): void;
    export const expect: any;
    export function mock(): any;
}
