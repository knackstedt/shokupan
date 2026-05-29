import { describe, expect, it } from 'bun:test';

describe('Sample 9: HTMX Fullstack', () => {
    it('should import Shokupan', async () => {
        const { Shokupan } = await import('shokupan');
        expect(Shokupan).toBeDefined();
    }, { timeout: 15000 });

    it('should create an app instance', async () => {
        const { Shokupan } = await import('shokupan');
        const app = new Shokupan({ port: 0 });
        expect(app).toBeDefined();
    }, { timeout: 15000 });
});
