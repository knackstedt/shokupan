import { describe, expect, it } from 'bun:test';

describe('Sample 1: Basic REST API', () => {
    it('should import shokupan without errors', async () => {
        const { Shokupan } = await import('../../src/index');
        expect(Shokupan).toBeDefined();
    }, { timeout: 15000 });

    it('should create an app instance', async () => {
        const { Shokupan } = await import('../../src/index');
        const app = new Shokupan();
        expect(app).toBeInstanceOf(Shokupan);
    }, { timeout: 15000 });
});
