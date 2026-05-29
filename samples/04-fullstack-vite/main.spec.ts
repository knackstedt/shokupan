import { describe, expect, it } from 'bun:test';

describe('Sample 4: Fullstack Vite', () => {
    it('should import VitePlugin', async () => {
        const { VitePlugin } = await import('../../src/index');
        expect(VitePlugin).toBeDefined();
    });

    it('should create an app instance', async () => {
        const { Shokupan } = await import('../../src/index');
        const app = new Shokupan();
        expect(app).toBeInstanceOf(Shokupan);
    });
});
