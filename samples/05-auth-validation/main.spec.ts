import { describe, expect, it } from 'bun:test';

describe('Sample 5: Auth + Validation', () => {
    it('should import Validation and Session', async () => {
        const { validate, Session } = await import('shokupan');
        expect(validate).toBeDefined();
        expect(Session).toBeDefined();
    });

    it('should create an app instance', async () => {
        const { Shokupan } = await import('shokupan');
        const app = new Shokupan();
        expect(app).toBeInstanceOf(Shokupan);
    });
});
