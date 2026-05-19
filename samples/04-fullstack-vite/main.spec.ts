import { describe, expect, it } from 'bun:test';

describe('Sample 4: Fullstack Vite', () => {
    it('should import VitePlugin', async () => {
        const { VitePlugin } = await import('shokupan');
        expect(VitePlugin).toBeDefined();
    });

    it('should create an app instance', async () => {
        const { Shokupan } = await import('shokupan');
        const app = new Shokupan();
        expect(app).toBeInstanceOf(Shokupan);
    });
});
