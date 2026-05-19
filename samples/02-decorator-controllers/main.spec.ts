import { describe, expect, it } from 'bun:test';

describe('Sample 2: Decorator Controllers', () => {
    it('should import decorators without errors', async () => {
        const { Controller, Get, Injectable } = await import('shokupan');
        expect(Controller).toBeDefined();
        expect(Get).toBeDefined();
        expect(Injectable).toBeDefined();
    });

    it('should create a controller instance', async () => {
        const { Shokupan } = await import('shokupan');
        const app = new Shokupan();
        expect(app).toBeInstanceOf(Shokupan);
    });
});
