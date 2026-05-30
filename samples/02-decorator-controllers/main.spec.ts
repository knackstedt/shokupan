import { describe, expect, it } from 'bun:test';

describe('Sample 2: Decorator Controllers', () => {
    it('should import decorators without errors', async () => {
        const { Controller, Get, Injectable } = await import('../../src/index');
        expect(Controller).toBeDefined();
        expect(Get).toBeDefined();
        expect(Injectable).toBeDefined();
    }, { timeout: 15000 });

    it('should create a controller instance', async () => {
        const { Shokupan } = await import('../../src/index');
        const app = new Shokupan();
        expect(app).toBeInstanceOf(Shokupan);
    }, { timeout: 15000 });
});
