import { describe, expect, it } from 'bun:test';

describe('Sample 6: File Upload', () => {
    it('should import Shokupan', async () => {
        const { Shokupan } = await import('shokupan');
        expect(Shokupan).toBeDefined();
    });

    it('should create an app instance', async () => {
        const { Shokupan } = await import('shokupan');
        const app = new Shokupan({ port: 0 });
        expect(app).toBeDefined();
    });
});
