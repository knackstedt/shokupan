import { describe, expect, it, beforeAll, afterAll } from 'bun:test';

describe('Sample 1: Basic REST API', () => {
    it('should import shokupan without errors', async () => {
        const { Shokupan } = await import('shokupan');
        expect(Shokupan).toBeDefined();
    });

    it('should create an app instance', async () => {
        const { Shokupan } = await import('shokupan');
        const app = new Shokupan();
        expect(app).toBeInstanceOf(Shokupan);
    });
});
