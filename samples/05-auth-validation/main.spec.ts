import { describe, expect, it } from 'bun:test';

describe('Sample 5: Auth + Validation', () => {
    it('should import Validation and Session', async () => {
        const { validate, Session } = await import('../../src/index');
        expect(validate).toBeDefined();
        expect(Session).toBeDefined();
    }, { timeout: 15000 });

    it('should create an app instance', async () => {
        const { Shokupan } = await import('../../src/index');
        const app = new Shokupan();
        expect(app).toBeInstanceOf(Shokupan);
    }, { timeout: 15000 });
});
